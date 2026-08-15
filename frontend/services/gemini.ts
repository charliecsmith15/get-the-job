import { GoogleGenAI, Type } from '@google/genai';
import { Preferences, Resume, ContextResource } from '../types';

// Initialize the Gemini client
// Note: In a real app, ensure process.env.API_KEY is available in the environment.
const ai = new GoogleGenAI({
  vertexai: true,
  apiKey: process.env.API_KEY || 'proxy-placeholder',
});

export const analyzeJobMatch = async (jobDescription: string, preferences: Preferences, contextResources: ContextResource[]) => {
    const contextText = contextResources.map(c => `--- ${c.title} ---\n${c.content}`).join('\n\n');

    const prompt = `
    Analyze the following job description against my ideal job profile and additional context.

    My Ideal Job Profile (Petals Exercise):
    ${preferences.petalsExercise || 'Not provided.'}

    Additional Context & Resources:
    ${contextText || 'None provided.'}

    Job Description:
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
                        summary: {
                            type: Type.STRING,
                            description: "A short, 2-sentence summary of why this is or isn't a good fit."
                        },
                        pros: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "List of 3-5 reasons this job is a good match."
                        },
                        cons: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "List of 1-3 potential red flags or mismatches based on dealbreakers and context."
                        }
                    },
                    required: ["score", "summary", "pros", "cons"]
                }
            }
        });

        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Error analyzing job match:", error);
        throw error;
    }
};

export const tailorResumeSuggestion = async (jobDescription: string, baseResume: Resume) => {
    const prompt = `
    I am applying for a job. Please review my current resume and the job description, and suggest specific improvements or tailoring I should make to my resume to increase my chances.

    Job Description:
    ${jobDescription}

    My Current Resume (${baseResume.name}):
    ${baseResume.content}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are an expert career coach and resume writer. Provide actionable, specific advice.",
            }
        });
        return response.text;
    } catch (error) {
        console.error("Error tailoring resume:", error);
        throw error;
    }
}

export const generateTailoredResume = async (jobDescription: string, baseResume: Resume) => {
   const prompt = `
   I am applying for a job. Please rewrite and tailor my current resume to perfectly match the provided job description. 
   Highlight the most relevant experience, adjust keywords to match the job description, and ensure the formatting remains clean Markdown.
   Do not invent fake experience, but reframe existing experience to be as relevant as possible.
   Return ONLY the raw Markdown content of the new resume.

   Job Description:
   ${jobDescription}

   My Current Resume (${baseResume.name}):
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

export const generateInterviewQuestions = async (jobDescription: string) => {
    const prompt = `Based on the following job description, generate 5 highly relevant interview questions they might ask me, and provide a brief tip on how to answer each.
    
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
    const recentJournal = (appState.journalEntries || [])
        .sort((a: any, b: any) => b.date.localeCompare(a.date))
        .slice(0, 14)
        .map((e: any) => `${e.date}: ${e.content}`)
        .join('\n\n');

    const interviewQAs = (appState.interviewQuestions || [])
        .map((q: any) => `Q: ${q.question}\nA: ${q.response}`)
        .join('\n\n');

    const systemInstruction = `
    You are an expert AI career coach and job search companion.
    You have access to the user's job search data. Use this context to provide personalized, highly relevant advice.
    Keep your answers concise, encouraging, and actionable.

    --- IDEAL JOB PROFILE (PETALS EXERCISE) ---
    ${appState.preferences.petalsExercise || 'Not provided.'}

    --- CONTEXT RESOURCES ---
    ${appState.contextResources.map((c: any) => `${c.title}:\n${c.content}`).join('\n\n') || 'None.'}

    --- RECENT SEARCH JOURNAL (last 14 entries) ---
    ${recentJournal || 'No journal entries yet.'}

    --- INTERVIEW PREPARATION Q&A ---
    ${interviewQAs || 'No interview questions added yet.'}

    --- CURRENT JOBS ---
    ${appState.jobs.map((j: any) => [
        `## ${j.title || 'Untitled'} at ${j.company} (Status: ${j.status})`,
        j.location ? `Location: ${j.location}` : '',
        j.dateApplied ? `Applied: ${j.dateApplied}` : '',
        j.tags?.length ? `Tags: ${j.tags.join(', ')}` : '',
        j.description ? `Description:\n${j.description}` : '',
        j.matchScore ? `Match Score: ${j.matchScore}%` : '',
        j.matchAnalysis ? `Match Analysis: ${j.matchAnalysis}` : '',
    ].filter(Boolean).join('\n')).join('\n\n')}

    --- RESUMES ---
    ${appState.resumes.map((r: any) => `## ${r.name} (Target Role: ${r.targetRole})\n${r.content}`).join('\n\n')}
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
