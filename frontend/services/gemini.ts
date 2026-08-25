import { GoogleGenAI, Type } from '@google/genai';
import { Preferences, Resume, ContextResource } from '../types'; // Resume kept for tailorResumeSuggestion/generateTailoredResume baseResume param

const buildFoundationalContext = (
    preferences: Preferences,
    contextResources: ContextResource[],
    journalEntries?: { date: string; content: string }[]
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
${preferences.primaryResume || 'Not provided.'}
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

export const analyzeJobMatch = async (jobDescription: string, preferences: Preferences, contextResources: ContextResource[], journalEntries: { date: string; content: string }[]) => {
    const prompt = `
    Analyze the following job description against my career profile and context.

    ${buildFoundationalContext(preferences, contextResources, journalEntries)}

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
                            description: "3-5 general resume improvement suggestions to help this person stand out for this type of role. Keep suggestions high-level and directional (e.g. 'Emphasize leadership experience', 'Highlight data-driven outcomes') rather than prescribing specific line edits."
                        }
                    },
                    required: ["score", "pros", "cons", "fitReason", "resumeEdits"]
                }
            }
        });

        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Error analyzing job match:", error);
        throw error;
    }
};

export const tailorResumeSuggestion = async (jobDescription: string, baseResume: Resume, preferences: Preferences, contextResources: ContextResource[], journalEntries: { date: string; content: string }[]) => {
    const prompt = `
    Review my resume against this job description and tell me exactly what to change to improve my chances. Be direct and specific — cite the job requirements and my resume content by name.

    ${buildFoundationalContext(preferences, contextResources, journalEntries)}

    Job Description:
    ${jobDescription}

    Resume Being Tailored (${baseResume.name}):
    ${baseResume.content}
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

export const generateTailoredResume = async (jobDescription: string, baseResume: Resume, preferences: Preferences, contextResources: ContextResource[], journalEntries: { date: string; content: string }[]) => {
   const prompt = `
   Rewrite and tailor my resume to match the job description. Highlight the most relevant experience, adjust keywords, and keep formatting clean Markdown.
   Do not invent experience — reframe what exists. Let my career profile and foundational context guide which aspects of my background to emphasize.
   Return ONLY the raw Markdown content of the new resume.

   ${buildFoundationalContext(preferences, contextResources, journalEntries)}

   Job Description:
   ${jobDescription}

   Base Resume (${baseResume.name}):
   ${baseResume.content}
   `;

   try {
       const response = await ai.models.generateContent({
           model: 'gemini-2.5-flash',
           contents: prompt,
           config: {
               systemInstruction: "You are an expert resume writer. Output only the tailored resume in Markdown format. Do not include conversational filler.",
           }
       });
       // Strip potential markdown code block wrappers if the model adds them
       let text = response.text.trim();
       if (text.startsWith('```markdown')) {
           text = text.replace(/^```markdown\n/, '').replace(/\n```$/, '');
       } else if (text.startsWith('```')) {
           text = text.replace(/^```\n/, '').replace(/\n```$/, '');
       }
       return text;
   } catch (error) {
       console.error("Error generating tailored resume:", error);
       throw error;
   }
}

export const generateInterviewQuestions = async (
    jobDescription: string,
    preferences: Preferences,
    savedQuestions: { question: string; response: string }[]
) => {
    const relevantQA = savedQuestions
        .filter(q => q.response?.trim())
        .map(q => `Q: ${q.question}\nA: ${q.response}`)
        .join('\n\n');

    const prompt = `Generate 5 highly relevant interview questions for this role. Return only the questions — no answers, no tips, no explanations for why each question was chosen.

LINKEDIN PROFILE:
${preferences.linkedInProfile || 'Not provided.'}

PRIMARY RESUME:
${preferences.primaryResume || 'Not provided.'}
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

    ${buildFoundationalContext(appState.preferences, appState.contextResources, appState.journalEntries)}

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
