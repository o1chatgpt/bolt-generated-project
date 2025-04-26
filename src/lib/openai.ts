import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export const aiPersonalities = {
  codeReviewer: {
    name: 'Code Reviewer',
    systemPrompt: 'You are an expert code reviewer focusing on best practices, security, and performance.',
  },
  architect: {
    name: 'System Architect',
    systemPrompt: 'You are a senior system architect specializing in scalable system design and architecture patterns.',
  },
  debugger: {
    name: 'Debugger',
    systemPrompt: 'You are an expert debugger focusing on identifying and fixing complex software issues.',
  },
  documentationWriter: {
    name: 'Documentation Writer',
    systemPrompt: 'You are a technical writer specializing in clear, comprehensive documentation.',
  },
};

export async function generateAIResponse(
  personality: keyof typeof aiPersonalities,
  customInstructions: string,
  prompt: string
) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: aiPersonalities[personality].systemPrompt,
        },
        {
          role: 'user',
          content: `Instructions: ${customInstructions}\n\nPrompt: ${prompt}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating AI response:', error);
    throw error;
  }
}
