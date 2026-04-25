import { GoogleGenAI, Type } from "@google/genai";
import { Character } from "../types";

const getAI = () => {
  const customUrl = localStorage.getItem('custom_ai_endpoint');
  if (customUrl) {
    return new GoogleGenAI({ 
      apiKey: (localStorage.getItem('custom_ai_key') || process.env.GEMINI_API_KEY) as string,
      baseUrl: customUrl 
    });
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
};

export const aiService = {
  async detectCharacters(frames: string[]): Promise<Character[]> {
    const ai = getAI();
    const imageParts = frames.map(b64 => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: b64.split(",")[1]
      }
    }));

    const prompt = `Phân tích các khung hình video này. Xây dựng CHARACTER BIBLE cho từng nhân vật xuất hiện.
Trả về JSON array thuần túy:
[{
  "name": "Tên hoặc mô tả nhân vật",
  "role": "Vai trò / nghề nghiệp",
  "description": "Ngoại hình & Trang phục CỰC KỲ CHI TIẾT: chất liệu, màu sắc chính xác, tình trạng quần áo, kiểu tóc, độ tuổi ước tính, vóc dáng",
  "physicality": "Ngôn ngữ cơ thể, cách di chuyển, thói quen cử chỉ",
  "closeup_notes": "Chi tiết cần bắt khi cận cảnh: kết cấu da, đặc điểm ánh mắt, biểu cảm đặc trưng",
  "voice": "Phong cách giọng nói, tông giọng, nhịp điệu"
}]`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        role: "user",
        parts: [
          ...imageParts,
          { text: prompt }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              description: { type: Type.STRING },
              physicality: { type: Type.STRING },
              closeup_notes: { type: Type.STRING },
              voice: { type: Type.STRING }
            },
            required: ["name", "role", "description", "voice"]
          }
        }
      }
    });

    try {
      const list = JSON.parse(result.text || "[]");
      return list.map((c: any, i: number) => ({
        ...c,
        id: `char-${Date.now()}-${i}`
      }));
    } catch (e) {
      console.error("Failed to parse characters", e);
      return [];
    }
  },

  async getComplianceRules() {
    try {
      const res = await fetch("/api/compliance");
      return await res.json();
    } catch {
      return null;
    }
  },

  async generateScript(
    frames: string[],
    characters: Character[],
    duration: number,
    idea: string
  ): Promise<string> {
    const ai = getAI();
    // Fetch latest compliance rules to ground the generation
    const compliance = await this.getComplianceRules();
    const complianceStr = compliance ? `
TUÂN THỦ QUY TẮC CỘNG ĐỒNG (CẬP NHẬT: ${compliance.lastUpdated}):
- TikTok: ${compliance.platforms.tiktok.rules.join(", ")}
- Facebook: ${compliance.platforms.facebook.rules.join(", ")}
- YouTube: ${compliance.platforms.youtube.rules.join(", ")}
- Google: ${compliance.platforms.google.rules.join(", ")}
` : "";

    const charBible = characters.map(c => `
- NHÂN VẬT: ${c.name}
  + Vai trò: ${c.role}
  + Ngoại hình & Trang phục: ${c.description}
  + Tính cách & Cử chỉ: ${c.physicality}
  + Cận cảnh (Closeup): ${c.closeup_notes}
  + Giọng nói: ${c.voice}
`).join("\n");

    const imageParts = frames.map(b64 => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: b64.split(",")[1]
      }
    }));

    const prompt = `Chào bạn, tôi là hệ thống Advanced Cinematic Script Extraction System. Dựa trên các hình ảnh và yêu cầu chi tiết bạn cung cấp, tôi đã thực hiện phân rã nội dung và chuyển đổi thành một kịch bản Shooting Script chuyên nghiệp, tối ưu hóa cho các công cụ AI Video Generation cao cấp nhất hiện nay.

Nhiệm vụ: PHÂN RÃ NỘI DUNG GỐC thành kịch bản Shooting Script CỰC KỲ CHI TIẾT, KHÔNG ĐƯỢC BỎ SÓT BẤT KỲ GIÂY NÀO CỦA CLIP GỐC.

YÊU CẦU VỀ ĐỘ DÀI & ĐỘ PHỦ (COVERAGE):
- Tỉ lệ bắt buộc: Ít nhất 20 - 25 SHOT cho mỗi 1 phút thời lượng. Nếu video dài ${duration} phút, kịch bản phải có tổng cộng khoảng ${Math.round(duration * 25)} shots.
- Mỗi trang chỉ chứa tối đa 8 SHOT để AI có thể tập trung mô tả sâu nhất.
- KHÔNG ĐƯỢC TÓM TẮT. Phải viết chi tiết từng hành động nhỏ nhất của nhân vật để khớp với thời lượng ${duration} phút.
- Nếu chưa viết hết toàn bộ kịch bản, BẮT BUỘC kết thúc trang bằng thẻ: [CONTINUE_REQUIRED].
- Chỉ dùng thẻ [END_OF_SCRIPT] khi đã đến cảnh cuối cùng thật sự.

CẤU TRÚC TRANG 1:
- THÔNG TIN CHUNG: Thời lượng ${duration} phút | Concept Viral: ${idea || "Auto-detect"}
- HỒ SƠ NHÂN VẬT (CHARACTER BIBLE):
${charBible}
- KỊCH BẢN CHI TIẾT (BẮT ĐẦU TỪ SHOT 1):
  ---
  SCENE [số]: [ĐỊA ĐIỂM] - [THỜI GIAN]
    SHOT [số]: [LOẠI SHOT & GÓC MÁY ĐIỆN ẢNH] (VD: Low-angle tracking shot, Extreme close-up with rack focus)
    ⏱ THỜI ĐIỂM: [00:00 - 00:00]
    VISUAL PROMPT (SIÊU CHI TIẾT): [Mô tả tối thiểu 100 chữ: Ánh sáng, màu sắc. TẬP TRUNG vào Micro-movements của nhân vật: ánh mắt liếc nhìn, cơ mặt co giật, nhịp thở, cách ngón tay chạm vào vật thể. Cử động phải mượt mà và tự nhiên.]
    AUDIO & SOUND DESIGN: [Mô tả âm thanh hiện trường (foley), tiếng bước chân, tiếng xì xào, và nhịp điệu âm nhạc khớp với nhịp cắt của hình ảnh.]
    VIRAL STRATEGY: [Tại sao shot này thu hút người xem?]
  ---

BẮT ĐẦU TRANG 1 (Mô tả 8 shot đầu tiên):`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        role: "user",
        parts: [
          ...imageParts,
          { text: prompt }
        ]
      }]
    });

    return result.text || "";
  },

  async continueScript(
    previousScript: string,
    frames: string[],
    characters: Character[],
    duration: number,
    idea: string
  ): Promise<string> {
    const compliance = await this.getComplianceRules();
    const complianceStr = compliance ? `
PLATFORM RULES:
- TikTok: ${compliance.platforms.tiktok.rules.join(", ")}
- Facebook: ${compliance.platforms.facebook.rules.join(", ")}
- YouTube: ${compliance.platforms.youtube.rules.join(", ")}
- Google: ${compliance.platforms.google.rules.join(", ")}
` : "";

    const ai = getAI();
    const imageParts = frames.map(b64 => ({
      inlineData: {
        data: b64.split(',')[1],
        mimeType: "image/jpeg"
      }
    }));

    const prompt = `Đây là phần tiếp nối của kịch bản trước đó cho video dài ${duration} phút.
Dưới đây là phần kịch bản đã viết:
"${previousScript.slice(-1000)}"

NHIỆM VỤ: Hãy viết tiếp TRANG TIẾP THEO của kịch bản Shooting Script này. 
- Bắt đầu từ SHOT tiếp theo ngay lập tức.
- YÊU CẦU: Mỗi trang viết tối đa 8 SHOT để giữ độ chi tiết cao nhất.
- TẬP TRUNG vào: Góc máy điện ảnh, Micro-movements (ánh mắt, hơi thở, cử chỉ nhỏ) và Sound Design chuyên nghiệp.
- Nếu vẫn chưa hết video ${duration} phút, kết thúc bằng: [CONTINUE_REQUIRED].
- Nếu đã đến cảnh cuối, kết thúc bằng: [END_OF_SCRIPT].
- Tuân thủ quy tắc cộng đồng: ${complianceStr}

HÃY VIẾT TIẾP:`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [...imageParts, { text: prompt }] }],
      config: { temperature: 0.7 }
    });

    return result.text || "";
  }
};
