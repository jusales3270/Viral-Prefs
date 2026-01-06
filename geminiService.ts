
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";

const SYSTEM_INSTRUCTION_BASE = `
### ROLE
Você é o Estrategista Criativo Sênior da Prefeitura de Boituva. Especialista em adaptar tendências REAIS de redes sociais para serviços públicos.

### SEGURANÇA E VERDADE (CRÍTICO)
1. **PROIBIDO INVENTAR LINKS:** Se você receber um link da ferramenta, use esse link EXATAMENTE como ele é. 
2. **FORMATO CLICÁVEL:** Sempre formate links como Markdown: [Texto do Link](URL_EXTERNA).
3. **VERIFICAÇÃO DE DADOS:** Use apenas os links fornecidos pela ferramenta. Não tente "completar" URLs.
4. **NEUTRALIDADE:** Não mencione o nome de plataformas específicas como TikTok ou Instagram no relatório final, refira-se apenas como "Tendência" ou "Fonte".
`;

const getTrendsDeclaration: FunctionDeclaration = {
  name: 'get_digital_trends',
  parameters: {
    type: Type.OBJECT,
    description: "Busca tendências reais e hashtags virais em alta no Brasil via scraper de dados.",
    properties: {
      limit: { type: Type.NUMBER, description: "Máximo 5." },
    },
    required: ["limit"],
  },
};

const getSongsDeclaration: FunctionDeclaration = {
  name: 'get_digital_audio',
  parameters: {
    type: Type.OBJECT,
    description: "Busca músicas e áudios que estão bombando nas redes sociais no Brasil agora.",
    properties: {
      limit: { type: Type.NUMBER, description: "Máximo 5." },
    },
    required: ["limit"],
  },
};

export const createDiscoverySession = () => {
  const apiKey = (window as any).process?.env?.API_KEY || (process as any)?.env?.API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION_BASE + "\nUse as ferramentas para obter dados reais de tendências. Repasse os links EXATAMENTE como recebidos.",
      tools: [{ functionDeclarations: [getTrendsDeclaration, getSongsDeclaration] }],
    },
  });
};

export const createAnalysisSession = () => {
  const apiKey = (window as any).process?.env?.API_KEY || (process as any)?.env?.API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  return ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION_BASE + `
### ESTRUTURA DO RELATÓRIO OBRIGATÓRIA
Siga EXATAMENTE esta ordem e use Markdown para links:

**TENDÊNCIA DETECTADA:** [Nome]
**FONTE ORIGINAL:** [Clique aqui para abrir a referência](URL_FORNECIDA)
**RISCO INSTITUCIONAL:** [Baixo/Médio/Alto]

**ANÁLISE DO CONTEXTO:**
[Descrição da tendência]

**ESTRATÉGIA PARA BOITUVA:**
[Como aplicar na comunicação oficial]

**PROPOSTA DE ROTEIRO:**
[Script sugerido para vídeo curto]
`,
      tools: [{ googleSearch: {} }],
    },
  });
};
