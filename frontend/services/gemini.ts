import { GoogleGenAI, Type } from '@google/genai';
import { Preferences, ContextResource } from '../types';

const buildFoundationalContext = (
    preferences: Preferences,
    contextResources: ContextResource[],
    journalEntries: { date: string; content: string }[] | undefined,
    resumeMarkdown: string
) => {
    const recentJournal = journalEntries
        ?.filter(e => (Date.now() - new Date(e.date).getTime()) / 86400000 <= 14)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(e => `${e.date}: ${e.content}`)
        .join('\n\n');

    return `
=== FOUNDATIONAL CAREER CONTEXT — treat as primary reference for all responses ===

CONTEXT RESOURCES (read first — defines the job search approach and explains the frameworks below):
${contextResources.length ? contextResources.map(c => `[${c.title}]\n${c.content}`).join('\n\n') : 'None added yet.'}

IDEAL JOB PROFILE (Petals Exercise):
${preferences.petalsExercise || 'Not provided.'}

LINKEDIN PROFILE:
${preferences.linkedInProfile || 'Not provided.'}

PRIMARY RESUME:
${resumeMarkdown || 'Not provided.'}
${recentJournal ? `\nRECENT JOURNAL (last 14 days):\n${recentJournal}` : ''}
=== END FOUNDATIONAL CONTEXT ===
`;
};

// Initialize the Gemini client
// Note: In a real app, ensure process.env.API_KEY is available in the environment.
const ai = new GoogleGenAI({
  vertexai: true,
  apiKey: process.env.API_KEY || 'proxy-placeholder',
});

export const analyzeJobMatch = async (jobDescription: string, preferences: Preferences, contextResources: ContextResource[], journalEntries: { date: string; content: string }[], resumeMarkdown: string) => {
    const prompt = `
    Analyze the following job description against my career profile and context.

    ${buildFoundationalContext(preferences, contextResources, journalEntries, resumeMarkdown)}

    Job Description to Analyze:
    ${jobDescription}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        score: {
                            type: Type.NUMBER,
                            description: "A match score from 0 to 100 based on how well the job fits the preferences and context."
                        },
                        pros: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "List of 3-5 reasons this job is a good match based on the user's background and career profile."
                        },
                        cons: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "List of 1-3 potential red flags or mismatches based on the user's career profile and dealbreakers."
                        },
                        fitReason: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "3-5 bullet points explaining why this person is a good fit for this specific role. Each bullet should be a concise, complete sentence referencing their background, skills, or career profile directly."
                        },
                        resumeEdits: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "3-5 general resume improvement suggestions to help this person stand out for this type of role. Keep suggestions high-level and directional rather than prescribing specific line edits."
                        },
                        missingExperience: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "3-5 specific qualifications, skills, or experiences that the job description requires or strongly prefers that are absent or underrepresented in the candidate's background. Be direct and specific."
                        }
                    },
                    required: ["score", "pros", "cons", "fitReason", "resumeEdits", "missingExperience"]
                }
            }
        });

        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Error analyzing job match:", error);
        throw error;
    }
};

export const tailorResumeSuggestion = async (jobDescription: string, resumeMarkdown: string, preferences: Preferences, contextResources: ContextResource[], journalEntries: { date: string; content: string }[]) => {
    const prompt = `
    Review my resume against this job description and tell me exactly what to change to improve my chances. Be direct and specific — cite the job requirements and my resume content by name.

    ${buildFoundationalContext(preferences, contextResources, journalEntries, resumeMarkdown)}

    Job Description:
    ${jobDescription}

    Resume Being Tailored:
    ${resumeMarkdown}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are an expert resume coach. Give direct, prioritized advice on what to change in this resume for this specific role. Use short sections with bullet points. Lead with the highest-impact edits. Do not give generic advice.",
            }
        });
        return response.text;
    } catch (error) {
        console.error("Error tailoring resume:", error);
        throw error;
    }
}

export interface ResumeCandidateLine {
    id: string;
    sectionId: string;
    entryId?: string | null;
    content: string;
}

export interface ResumeLineSelection {
    lineId: string;
    include: boolean;
    priority: number;
}

// Selects which candidate resume lines to include for a specific job —
// it never rewrites or invents wording, only picks from the given IDs.
// The caller is responsible for deterministically rendering the final
// document from the selection (see frontend/services/resumeRenderer.ts) and
// for enforcing the length budget as a hard backstop, since the model isn't
// reliable at exact character-count arithmetic.
export const selectResumeLines = async (
    jobDescription: string,
    sections: { id: string; label: string; type: string }[],
    entries: { id: string; sectionId: string; heading: string; subheading?: string }[],
    candidateLines: ResumeCandidateLine[],
    totalCharBudget: number,
    resumeMarkdown: string,
    preferences: Preferences,
    contextResources: ContextResource[],
    journalEntries: { date: string; content: string }[]
): Promise<ResumeLineSelection[]> => {
    const prompt = `
    Decide which of my resume's candidate bullet lines to include when tailoring my resume for this job. Some lines are from my baseline resume; others are extra lines I've specifically added as candidates for this job application. You are choosing WHICH lines to include — do not rewrite, reword, or invent any content. Return exact line IDs from the candidate list below.

    ${buildFoundationalContext(preferences, contextResources, journalEntries, resumeMarkdown)}

    Job Description:
    ${jobDescription}

    Resume sections (fixed display order — you are not choosing order):
    ${sections.map(s => `- ${s.id} (${s.label}, type: ${s.type})`).join('\n')}

    Resume entries (e.g. jobs/degrees each candidate line may belong to):
    ${entries.length ? entries.map(e => `- ${e.id} [section: ${e.sectionId}]: ${[e.heading, e.subheading].filter(Boolean).join(', ')}`).join('\n') : 'None.'}

    Candidate lines:
    ${candidateLines.map(l => `- id="${l.id}" section="${l.sectionId}"${l.entryId ? ` entry="${l.entryId}"` : ''}: ${l.content}`).join('\n')}

    Target length budget: approximately ${totalCharBudget} characters for the whole rendered resume — prioritize the lines most relevant to this specific job description and only include enough to stay near that budget. You don't need to hit an exact count; a downstream trimming step handles anything still over budget using your priority values.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are an expert resume writer choosing which existing resume lines to include for a specific job. You never invent, reword, or embellish content — you only select from the given candidate line IDs.",
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        selections: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    lineId: { type: Type.STRING, description: "Must exactly match one of the given candidate line IDs." },
                                    include: { type: Type.BOOLEAN, description: "Whether this line should be included in the tailored resume." },
                                    priority: { type: Type.NUMBER, description: "Relative importance from 1 (lowest) to 10 (highest), used only if further trimming is needed to fit the length budget." },
                                },
                                required: ["lineId", "include", "priority"]
                            }
                        }
                    },
                    required: ["selections"]
                }
            }
        });
        const parsed = JSON.parse(response.text.trim());
        return Array.isArray(parsed.selections) ? parsed.selections : [];
    } catch (error) {
        console.error("Error selecting resume lines:", error);
        throw error;
    }
}

export interface ParsedResumeTextBlock { sectionId: string; content: string; }
export interface ParsedResumeEntry { sectionId: string; heading: string; subheading?: string; startDate?: string; endDate?: string; lines: string[]; }
export interface ParsedResumeListItem { sectionId: string; content: string; }
export interface ParsedResume {
    textBlocks: ParsedResumeTextBlock[];
    entries: ParsedResumeEntry[];
    listItems: ParsedResumeListItem[];
}

// One-time onboarding helper: proposes a structured split of a freshly
// pasted resume against the current section config. The caller shows this
// to the user for review/edit before saving it as real structured data —
// the AI proposes, the user (and code) commits.
export const parseResumeIntoSections = async (
    rawText: string,
    sections: { id: string; label: string; type: string }[]
): Promise<ParsedResume> => {
    const textSections = sections.filter(s => s.type === 'text');
    const entriesSections = sections.filter(s => s.type === 'entries');
    const listSections = sections.filter(s => s.type === 'list');

    const prompt = `
    Split this pasted resume into the structured sections below. Preserve the original wording as closely as possible — do not invent, embellish, or summarize; only reorganize what's actually there. Omit anything that doesn't fit one of these sections.

    Sections:
    ${textSections.map(s => `- ${s.id} (${s.label}): a single free-text block, e.g. contact info or a summary paragraph.`).join('\n')}
    ${entriesSections.map(s => `- ${s.id} (${s.label}): a list of entries (one per job/degree/etc.), each with a heading, optional subheading, optional start/end dates, and a list of bullet lines.`).join('\n')}
    ${listSections.map(s => `- ${s.id} (${s.label}): a flat list of short individual lines, e.g. one per skill.`).join('\n')}

    Resume text:
    ${rawText}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are reorganizing an existing resume's exact content into a structured format. Never invent, embellish, or rewrite wording — only split and categorize what's already there.",
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        textBlocks: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    sectionId: { type: Type.STRING },
                                    content: { type: Type.STRING },
                                },
                                required: ["sectionId", "content"]
                            }
                        },
                        entries: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    sectionId: { type: Type.STRING },
                                    heading: { type: Type.STRING },
                                    subheading: { type: Type.STRING },
                                    startDate: { type: Type.STRING },
                                    endDate: { type: Type.STRING },
                                    lines: { type: Type.ARRAY, items: { type: Type.STRING } },
                                },
                                required: ["sectionId", "heading", "lines"]
                            }
                        },
                        listItems: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    sectionId: { type: Type.STRING },
                                    content: { type: Type.STRING },
                                },
                                required: ["sectionId", "content"]
                            }
                        },
                    },
                    required: ["textBlocks", "entries", "listItems"]
                }
            }
        });
        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Error parsing resume:", error);
        throw error;
    }
}

export const generateInterviewQuestions = async (
    jobDescription: string,
    preferences: Preferences,
    savedQuestions: { question: string; response: string }[],
    resumeMarkdown: string
) => {
    const relevantQA = savedQuestions
        .filter(q => q.response?.trim())
        .map(q => `Q: ${q.question}\nA: ${q.response}`)
        .join('\n\n');

    const prompt = `Generate 5 highly relevant interview questions for this role. Return only the questions — no answers, no tips, no explanations for why each question was chosen.

LINKEDIN PROFILE:
${preferences.linkedInProfile || 'Not provided.'}

PRIMARY RESUME:
${resumeMarkdown || 'Not provided.'}
${relevantQA ? `\nINTERVIEW PREP (existing Q&A that may be relevant):\n${relevantQA}` : ''}

Job Description:
${jobDescription}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating questions:", error);
        throw error;
    }
}

export const getRelevantTechnicalQuestions = async (
    jobDescription: string,
    technicalQuestions: { id: string; question: string }[]
): Promise<string[]> => {
    if (!technicalQuestions.length) return [];

    const prompt = `You are reviewing saved technical interview questions to determine which are relevant to a specific job role.

Return a JSON array containing ONLY the IDs of questions that are relevant to this job. If none apply, return [].

JOB DESCRIPTION:
${jobDescription}

SAVED TECHNICAL QUESTIONS:
${technicalQuestions.map(q => `ID: "${q.id}"\nQuestion: ${q.question}`).join('\n\n')}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });
        const parsed = JSON.parse(response.text.trim());
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return technicalQuestions.map(q => q.id);
    }
};

export const chatWithCompanion = async (
    message: string,
    history: { role: 'user' | 'model', text: string }[],
    appState: any
) => {
    const interviewQAs = (appState.interviewQuestions || [])
        .map((q: any) => `Q: ${q.question}\nA: ${q.response}`)
        .join('\n\n');

    const systemInstruction = `
    You are an expert AI career coach and job search companion.
    You have access to the user's full career profile and job search data. Always ground your advice in their foundational context — especially the Petals Exercise, What Color Is Your Parachute notes, LinkedIn profile, and primary resume.
    Keep your answers concise, encouraging, and actionable.

    ${buildFoundationalContext(appState.preferences, appState.contextResources, appState.journalEntries, appState.resumeMarkdown)}

    --- INTERVIEW PREPARATION Q&A ---
    ${interviewQAs || 'No interview questions added yet.'}

    --- CURRENT JOBS ---
    ${appState.jobs.map((j: any) => {
        const a = (appState.jobAnalyses ?? []).find((x: any) => x.jobId === j.id);
        return [
            `## ${j.title || 'Untitled'} at ${j.company} (Status: ${j.status})`,
            j.location ? `Location: ${j.location}` : '',
            j.dateApplied ? `Applied: ${j.dateApplied}` : '',
            j.tags?.length ? `Tags: ${j.tags.join(', ')}` : '',
            j.description ? `Description:\n${j.description}` : '',
            a ? `Match Score: ${a.score}%` : '',
            a?.fitReason ? `Why a good fit: ${a.fitReason}` : '',
        ].filter(Boolean).join('\n');
    }).join('\n\n')}
    `;

    const contents = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
    }));

    contents.push({
        role: 'user',
        parts: [{ text: message }]
    });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
            }
        });
        return response.text;
    } catch (error) {
        console.error("Error in chatWithCompanion:", error);
        throw error;
    }
};
