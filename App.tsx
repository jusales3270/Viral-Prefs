
import React, { useState, useRef, useEffect } from 'react';
import { createDiscoverySession, createAnalysisSession } from './geminiService';
import { AnalysisResult, RiskLevel } from './types';
import ReactMarkdown from 'react-markdown';

const callTool = async (name: string, args: any) => {
  const token = localStorage.getItem('APIFY_TOKEN');
  
  if (!token) {
    return { error: "CHAVE DE ACESSO NÃO CONFIGURADA. Clique no ícone de engrenagem abaixo." };
  }

  try {
    const isSong = name.includes('audio');
    const query = isSong ? 'trending songs brazil' : 'trending hashtags brazil';
    
    console.log(`[RADAR] Consultando base de tendências: ${query}`);

    const response = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-trends-scraper/run-sync-get-dataset-items?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchQueries: [query],
        resultsLimit: Math.min(args.limit || 3, 5),
        proxyConfiguration: { useApifyProxy: true },
        shouldDownloadVideos: false,
        viewCount: "desc"
      })
    });

    if (!response.ok) {
      return { error: `Erro na conexão com o provedor (${response.status}). Verifique seu token.` };
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return { error: "Não foram encontrados novos dados de tendência no momento." };
    }

    const items = data.map((item: any) => {
      const officialUrl = item.webVideoUrl || item.url || item.video_url || item.share_url;
      const videoId = item.id || item.video_id;
      const fallbackUrl = videoId ? `https://www.tiktok.com/v/${videoId}` : "https://www.google.com";
      
      return {
        name: item.text || item.desc || item.hashtagName || "Tendência Identificada",
        link: officialUrl || fallbackUrl,
        views: item.playCount || item.views || "Viral"
      };
    });

    return { trends: items, songs: isSong ? items : [] };

  } catch (e: any) {
    return { error: `Erro técnico de rede: ${e.message}` };
  }
};

export default function App() {
  const [trendInput, setTrendInput] = useState('');
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const discoveryChat = useRef<any>(null);
  const analysisChat = useRef<any>(null);

  useEffect(() => {
    discoveryChat.current = createDiscoverySession();
    analysisChat.current = createAnalysisSession();
  }, []);

  const handleAiAction = async (prompt: string, trendName: string, officialUrl?: string, isAuto: boolean = false) => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await analysisChat.current.sendMessage({ message: prompt });
      const content = response.text || "Sem conteúdo disponível.";
      
      const riskMatch = content.match(/RISCO INSTITUCIONAL:\*\*\s*(Baixo|Médio|Alto|Medio)/i);
      let extractedRisk = RiskLevel.LOW;
      if (riskMatch) {
        const val = riskMatch[1].toLowerCase();
        if (val === 'alto') extractedRisk = RiskLevel.HIGH;
        else if (val.includes('med')) extractedRisk = RiskLevel.MEDIUM;
      }
      
      const newResult: AnalysisResult = {
        id: Date.now().toString(),
        trend: trendName,
        timestamp: new Date(),
        content: content,
        sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [],
        riskLevel: extractedRisk,
        officialUrl: officialUrl,
        isAutoDiscovery: isAuto,
      };

      setHistory(prev => [newResult, ...prev]);
      setSelectedIndex(0);
      setTrendInput('');
    } catch (err: any) {
      setError(`Falha na inteligência: ${err.message}`);
      analysisChat.current = createAnalysisSession();
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!trendInput.trim()) return;
    handleAiAction(`REALIZE UMA ANÁLISE INSTITUCIONAL SOBRE: "${trendInput}". Gere um relatório com referências clicáveis.`, trendInput, undefined, false);
  };

  const handleAutoDiscover = async () => {
    const token = localStorage.getItem('APIFY_TOKEN');
    if (!token) { setIsSettingsOpen(true); return; }

    setLoading(true);
    setError(null);
    try {
      let discoveryResponse = await discoveryChat.current.sendMessage({ 
        message: "Acesse as ferramentas de tendências e liste 3 temas virais agora com seus links de referência." 
      });

      let allData: any[] = [];
      let iterations = 0;

      while (discoveryResponse.functionCalls && discoveryResponse.functionCalls.length > 0 && iterations < 2) {
        iterations++;
        const toolResponses = [];
        for (const fc of discoveryResponse.functionCalls) {
          const result = await callTool(fc.name, fc.args);
          if (result.error) { setError(result.error); setLoading(false); return; }
          allData = [...allData, ...(result.trends || [])];
          toolResponses.push({ functionResponse: { id: fc.id, name: fc.name, response: result } });
        }
        discoveryResponse = await discoveryChat.current.sendMessage({ message: toolResponses });
      }

      if (allData.length === 0) throw new Error("Não foi possível extrair tendências no momento.");

      const mainTrend = allData[0];
      const context = allData.slice(0, 3).map((i, idx) => 
        `TENDÊNCIA DETECTADA #${idx+1}:\nNOME: ${i.name}\nURL_REFERENCIA: ${i.link}`
      ).join('\n\n');

      setLoading(false);
      handleAiAction(
        `Desenvolva o relatório institucional baseado nas tendências de redes sociais abaixo:\n\n${context}\n\n⚠️ IMPORTANTE: Utilize links Markdown [Texto](URL) para as fontes originais fornecidas.`, 
        mainTrend.name, 
        mainTrend.link,
        true
      );
    } catch (e: any) {
      setError(`Falha no radar: ${e.message}`);
      setLoading(false);
    }
  };

  const currentResult = selectedIndex !== null ? history[selectedIndex] : null;

  return (
    <div className="flex h-screen bg-[#F1F5F9] overflow-hidden text-slate-900 font-['Inter']">
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
          <div className="bg-white p-12 rounded-[3rem] w-full max-w-md shadow-2xl border-4 border-white">
            <h3 className="text-3xl font-black mb-4 text-slate-800 tracking-tight">Configuração de Dados</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium leading-relaxed">Insira o token do provedor de dados para habilitar a varredura automática de tendências digitais.</p>
            <input
              type="password"
              defaultValue={localStorage.getItem('APIFY_TOKEN') || ''}
              id="token-input"
              placeholder="api_access_token_..."
              className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl mb-8 focus:outline-none focus:border-blue-500 transition-all font-mono text-sm shadow-inner"
            />
            <div className="flex gap-4">
              <button onClick={() => setIsSettingsOpen(false)} className="flex-1 py-4 text-slate-400 font-black">Voltar</button>
              <button 
                onClick={() => {
                  const val = (document.getElementById('token-input') as HTMLInputElement).value;
                  localStorage.setItem('APIFY_TOKEN', val.trim());
                  setIsSettingsOpen(false);
                  window.location.reload();
                }} 
                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl"
              >
                Ativar Radar
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col hidden lg:flex">
        <div className="p-8 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2.5 rounded-2xl shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tighter">Viral Prefs</h1>
              <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest">Boituva/SP</p>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <button
            onClick={handleAutoDiscover}
            disabled={loading}
            className="w-full py-5 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black text-xs shadow-xl transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            VARREDURA AUTOMÁTICA
          </button>

          <div className="h-px bg-slate-100 my-6"></div>

          {history.length === 0 ? (
            <p className="text-center text-[10px] uppercase font-black text-slate-300 mt-10">Nenhuma análise salva</p>
          ) : history.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => setSelectedIndex(idx)}
              className={`w-full text-left p-6 rounded-[2rem] transition-all border-2 ${selectedIndex === idx ? 'bg-blue-50 border-blue-200 shadow-md' : 'bg-transparent border-transparent hover:bg-slate-50'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black uppercase text-blue-600">{item.isAutoDiscovery ? 'Radar' : 'Manual'}</span>
                <span className="text-[10px] text-slate-400 font-bold">{item.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
              </div>
              <p className="font-black text-slate-800 text-sm truncate uppercase">{item.trend}</p>
            </button>
          ))}
        </div>

        <div className="p-8 border-t border-slate-100 bg-white">
          <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2 text-slate-400 hover:text-blue-600 transition-all font-black uppercase text-[10px] tracking-widest">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Configurações
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-6 lg:p-12">
          {!currentResult && !loading ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-3xl mx-auto">
              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl mb-12 animate-pulse">
                 <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
              </div>
              <h2 className="text-7xl font-black text-slate-900 tracking-tighter mb-8 leading-none">
                Conecte-se às <span className="text-blue-600">Tendências.</span><br/>Proteja a <span className="text-slate-500">Gestão.</span>
              </h2>
              <p className="text-slate-500 text-2xl font-medium mb-16 leading-relaxed">
                Este agente extrai o que é relevante nas redes sociais e transforma em conteúdo institucional seguro para a prefeitura.
              </p>
              <button onClick={handleAutoDiscover} className="px-16 py-7 bg-blue-600 text-white rounded-[3rem] font-black text-2xl shadow-2xl hover:bg-blue-700 transition-all hover:scale-105 active:scale-95">VARREDURA EM TEMPO REAL</button>
            </div>
          ) : loading ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-32 h-32 border-[12px] border-slate-200 border-t-blue-600 rounded-full animate-spin mb-10 shadow-2xl"></div>
              <h3 className="text-4xl font-black text-slate-800 tracking-tighter uppercase italic">Analisando Tendências Atuais...</h3>
              <p className="text-slate-400 font-black uppercase text-xs tracking-[0.5em] mt-4">Extraindo dados de fontes verificadas</p>
            </div>
          ) : currentResult ? (
            <div className="max-w-5xl mx-auto py-10 animate-in fade-in slide-in-from-bottom-12 duration-700">
              <div className="bg-white rounded-[4rem] shadow-2xl border border-slate-100 overflow-hidden mb-32">
                <div className="bg-slate-900 p-16 text-white relative">
                  <div className="absolute top-0 right-0 w-full h-full bg-blue-600/10 blur-[100px] rounded-full"></div>
                  <div className="flex justify-between items-start mb-10 relative z-10">
                    <span className="bg-blue-600 px-8 py-3 rounded-full text-[12px] font-black uppercase tracking-widest shadow-xl">Relatório Institucional Gerado</span>
                    <button onClick={() => setSelectedIndex(null)} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <h2 className="text-5xl font-black tracking-tighter mb-4 uppercase">{currentResult.trend}</h2>
                  <div className="flex gap-8 text-xs font-black text-slate-400 relative z-10 uppercase tracking-[0.2em]">
                    <span className="flex items-center gap-3"><div className="w-3 h-3 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50"></div> {currentResult.timestamp.toLocaleDateString()}</span>
                    <span className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${currentResult.riskLevel === RiskLevel.HIGH ? 'bg-red-500 animate-pulse' : currentResult.riskLevel === RiskLevel.MEDIUM ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                      RISCO: {currentResult.riskLevel}
                    </span>
                  </div>
                </div>
                
                <div className="p-16 lg:p-24 prose prose-slate max-w-none prose-xl">
                  {currentResult.officialUrl && (
                    <div className="mb-16 p-8 bg-blue-50 rounded-[3rem] border-4 border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
                      <div className="text-center sm:text-left">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Referência de Dados</p>
                        <h4 className="text-xl font-black text-slate-800 leading-none">Tendência de Origem</h4>
                      </div>
                      <a 
                        href={currentResult.officialUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-[2rem] shadow-xl shadow-blue-200 transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
                      >
                        ABRIR FONTE
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                      </a>
                    </div>
                  )}

                  <ReactMarkdown components={{
                    h1: ({...props}) => <h1 className="text-4xl font-black border-b-4 border-slate-100 pb-8 mb-12 text-slate-900" {...props} />,
                    h2: ({...props}) => <h2 className="text-xl font-black mt-20 mb-8 text-blue-600 uppercase tracking-widest border-l-8 border-blue-600 pl-6" {...props} />,
                    p: ({...props}) => <p className="text-slate-600 leading-relaxed mb-10 font-medium" {...props} />,
                    li: ({...props}) => <li className="mb-6 text-slate-600 list-none flex items-start gap-4 font-bold"><div className="mt-2.5 w-3 h-3 bg-blue-400 rounded-full shrink-0 shadow-sm"></div><span {...props} /></li>,
                    a: ({...props}) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-4 px-10 py-5 bg-slate-900 text-white rounded-[2rem] font-black text-sm no-underline hover:bg-blue-600 transition-all shadow-2xl my-8 hover:-translate-y-1">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                        {props.children}
                      </a>
                    ),
                    hr: () => <hr className="my-20 border-slate-100" />
                  }}>
                    {currentResult.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-10 bg-white border-t border-slate-200 shadow-[0_-30px_60px_rgba(0,0,0,0.06)] z-20">
          <form onSubmit={handleAnalyze} className="max-w-5xl mx-auto flex gap-6">
            <div className="flex-1 relative group">
              <input
                id="manual-input"
                type="text"
                value={trendInput}
                onChange={(e) => setTrendInput(e.target.value)}
                placeholder="Insira o nome de uma tendência para análise da prefeitura..."
                className="w-full px-12 py-7 bg-slate-50 border-4 border-transparent rounded-[3rem] focus:outline-none focus:border-blue-600 transition-all font-black text-slate-900 placeholder-slate-400 shadow-inner text-xl"
              />
              <div className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors">
                 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !trendInput.trim()}
              className="px-16 py-7 bg-slate-900 hover:bg-black text-white font-black rounded-[3rem] shadow-2xl transition-all disabled:opacity-20 active:scale-95 text-xl uppercase italic tracking-tighter"
            >
              ANALISAR
            </button>
          </form>
        </div>

        {error && (
          <div className="absolute top-10 left-1/2 -translate-x-1/2 w-full max-w-xl px-10 z-[200] animate-in slide-in-from-top-12">
            <div className="bg-red-600 text-white p-8 rounded-[3.5rem] shadow-3xl flex items-center justify-between border-8 border-white">
              <div className="flex items-center gap-6">
                <div className="bg-white/20 p-4 rounded-3xl">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                </div>
                <p className="text-lg font-black leading-tight uppercase tracking-tighter">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="p-3 hover:bg-white/10 rounded-2xl transition-colors">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
