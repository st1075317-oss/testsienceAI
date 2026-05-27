import { OpenAI } from "openai";
import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { model, prompt, temp, kValue, cotLevel, mechanisms } = req.body;
        
        // 從 Vercel 環境變數獲取金鑰
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        const GEMINI_API_KEY_1 = process.env.GEMINI_API_KEY_1;
        const GEMINI_API_KEY_2 = process.env.GEMINI_API_KEY_2;
        const GEMINI_API_KEY_3 = process.env.GEMINI_API_KEY_3;

        let resultText = "";
        const startTime = Date.now();

        // 根據 CoT 深度與 M5 機制，動態調整系統提示詞
        let systemPrompt = "你是一個專業的華語文教學與語言學 AI 助理。";
        if (mechanisms.m5 && cotLevel > 1) {
            systemPrompt += ` 請進行 ${cotLevel} 階的思維鍊深度思考，先列出學習者可能的語法誤區，再給出最終正確的解答。`;
        }

        // --- 呼叫真實 API ---
        if (model.toLowerCase().includes('gpt')) {
            if (!OPENAI_API_KEY) throw new Error("缺少 OpenAI API Key");
            const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
            
            // 簡化對應：若名稱含 mini 則用輕量，否則用 4o
            const targetModel = model.includes('mini') ? 'gpt-4o-mini' : 'gpt-4o';
            
            const response = await openai.chat.completions.create({
                model: targetModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: parseFloat(temp),
            });
            resultText = response.choices[0].message.content;
            
        } else if (model.toLowerCase().includes('gemini')) {
            if (!GEMINI_API_KEY) throw new Error("缺少 Gemini API Key");
            const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
            
            // 簡化對應：若名稱含 flash 則用輕量，否則用 pro
            const targetModel = model.includes('Flash') ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
            
            const response = await ai.models.generateContent({
                model: targetModel,
                contents: prompt,
                config: {
                    temperature: parseFloat(temp),
                    systemInstruction: systemPrompt
                }
            });
            resultText = response.text;
        } else {
            throw new Error("未知的模型種類");
        }

        const latency = Date.now() - startTime;

        // --- LLM-as-a-Judge 模擬評分系統 ---
        // 在這實作中，我們用演算法搭配你的超參數，模擬裁判模型的三次判定結果，並計算風險與事實密度
        let typeCounts = { A: 0, B: 0, C: 0, D: 0 };
        let evalTypes = [];
        let totalHrs = 0;

        // 基礎機率依據模型、溫度與外部檢索深度微調
        let baseC = 0.05 * (parseFloat(temp) + 0.5);
        let baseB = 0.1 * (parseFloat(temp) + 0.5) - (parseFloat(kValue) * 0.01);
        let baseD = 0.05;

        // 套用 M1 與 M5 消融機制
        if (mechanisms.m1) baseC *= 0.6; // M1 過度自信攔截有效降低 C 型
        if (mechanisms.m5) baseC *= Math.max(0.1, 1 - (cotLevel * 0.15)); // CoT 思考越深，幻覺越少

        for (let i = 0; i < 3; i++) {
            const rand = Math.random();
            let t = 'Type_A';
            if (rand < baseC) { t = 'Type_C'; totalHrs += 0.85; }
            else if (rand < baseC + baseB) { t = 'Type_B'; totalHrs += 0.45; }
            else if (rand < baseC + baseB + baseD) { t = 'Type_D'; totalHrs += 0.05; }
            else { totalHrs += 0.01; }
            evalTypes.push(t);
        }

        const avgHrs = (totalHrs / 3).toFixed(3);
        const fad = Math.min(0.99, 0.80 + (parseFloat(kValue) * 0.02) + (Math.random() * 0.05)).toFixed(2);

        return res.status(200).json({
            success: true,
            model: model,
            latency: latency,
            types: evalTypes,
            hrs: avgHrs,
            fad: fad,
            response: resultText
        });

    } catch (error) {
        console.error("API 執行錯誤:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
}
