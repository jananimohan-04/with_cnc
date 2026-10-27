import type { Intent, Params } from './understand';

export interface PipelineCardSummary {
  refNo: string;
  customer: string;
  part: string;
  qty: number;
  stage: string;
}

export function getOpenAIApiKey(): string {
  try {
    const k = localStorage.getItem('argus.coworker.openai_key');
    if (k && k.trim()) return k.trim();
  } catch { /* ignore */ }
  return String(import.meta.env.VITE_OPENAI_API_KEY || '').trim();
}

export function setOpenAIApiKey(key: string): void {
  try {
    localStorage.setItem('argus.coworker.openai_key', key.trim());
  } catch { /* ignore */ }
}

export async function analyzeWithChatGPT(
  message: string,
  lang: 'ta' | 'tanglish' | 'en',
  cards: PipelineCardSummary[],
  history: Array<{ role: 'user' | 'assistant'; text: string }> = []
): Promise<{ intent: Intent; params: Params; reply: string } | null> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  const cardsSnippet = cards.length
    ? cards
        .slice(0, 30)
        .map((c) => `• [${c.stage}] Ref/Lead: ${c.refNo} | Customer: ${c.customer} | Part: ${c.part} | Qty: ${c.qty}`)
        .join('\n')
    : '(No active records currently in pipeline)';

  const systemPrompt = `You are "Co-worker", an intelligent AI ERP assistant for an engineering/manufacturing company's Sales Pipeline.
The user speaks or types commands (in English, Tamil, or Tanglish) to ADD, EDIT, DELETE, MOVE, or VIEW records.
Current Date: ${new Date().toISOString().slice(0, 10)}.
Language preference: ${lang === 'ta' ? 'Tamil' : lang === 'tanglish' ? 'Tanglish' : 'English'}.

Active Sales Pipeline Records on Board:
${cardsSnippet}

Analyze the user's message and return a strictly valid JSON object:
{
  "intent": "<intent_name>",
  "params": { ... },
  "reply": "<friendly confirmation or clarifying reply in ${lang === 'ta' ? 'Tamil' : lang === 'tanglish' ? 'Tanglish' : 'English'}>"
}

Supported intents and expected params:
1. "add_enquiry":
   params: {
     "company": "<customer/company name>",
     "products": [{ "name": "<product name>", "qty": <number>, "price": <optional number> }],
     "remarks": "<optional remarks string>"
   }

2. "edit_enquiry":
   params: {
     "identifier": "<lead_no/enquiry_no e.g. 1025, or company name>",
     "updates": {
       "quantity": <optional number>,
       "part_name": "<optional string>",
       "customer": "<optional string>",
       "estimated_value": <optional number>,
       "status": "<optional string>"
     }
   }

3. "delete_enquiry":
   params: {
     "identifier": "<lead_no/enquiry_no e.g. 1025, or company name>"
   }

4. "add_sales_order":
   params: {
     "company": "<customer/company name>",
     "products": [{ "name": "<product name>", "qty": <number>, "price": <optional number> }],
     "po_no": "<optional PO number>",
     "delivery_date": "<optional YYYY-MM-DD>"
   }

5. "edit_sales_order":
   params: {
     "identifier": "<order_no e.g. SO-2026-1020, or company name>",
     "updates": {
       "quantity": <optional number>,
       "unit_price": <optional number>,
       "po_no": "<optional string>",
       "delivery_date": "<optional YYYY-MM-DD>"
     }
   }

6. "delete_sales_order":
   params: {
     "identifier": "<order_no e.g. SO-2026-1020>"
   }

7. "move_stage":
   params: {
     "identifier": "<lead_no or order_no>",
     "target_stage": "Enquiry" | "Quotation" | "Sales Order" | "Inward" | "Finished Goods" | "DC" | "Invoice",
     "price": <optional unit price number if mentioned>
   }

8. "list_pipeline":
   params: {
     "stage": "<all | Enquiry | Quotation | Sales Order | DC | Invoice>"
   }

9. "add_company":
   params: {
     "name": "<company name>",
     "gst": "<optional GST>",
     "phone": "<optional phone>",
     "email": "<optional email>",
     "address": "<optional city/address>"
   }

10. "find_records":
   params: {
     "kind": "enquiry" | "quotation" | "sales_order" | "invoice" | "company",
     "query": "<search query string>"
   }

11. "open_page":
   params: {
     "page": "<page name e.g. pipeline, invoices, inventory>"
   }

12. "help":
   params: {
     "question": "<the question to answer>"
   }

Matching Guidelines:
- In Tamil speech recognition, English names appear phonetically:
  * "க் போகஸ்", "கியுக் ஃபோகஸ்", "க்யூ போகஸ்", "க்யு போகஸ்" = "Q-Focus" or "Q Focus"
  * "ஆபீ", "ஏபி", "அபீ" = "AABEE"
  * "கொட்டேஷன்" = Quotation, "என்குயரி" = Enquiry, "சேல்ஸ் ஆர்டர்" / "ஆர்டர்" = Sales Order
  * "மாத்தணும்", "போடணும்", "மாத்து", "மூவ்" = move_stage or convert
  * "ஆட் பண்ணனும்", "போடணும்" = add or create
- When user says "என்குயரி ல இருக்க க் போகஸ் டேட்டா வந்து கொட்டேஷன் ல மாத்தணும்", match customer "Q-Focus" from the active cards list, and output:
  { "intent": "move_stage", "params": { "identifier": "<lead_no of Q-Focus>", "target_stage": "Quotation", "customer": "Q-Focus" }, "reply": "Q-Focus என்குயரியை Quotation நிலைக்கு மாற்றவா?" }
- When user says "கொட்டேஷன் ஆட் பண்ணனும்" without mentioning a company, if there are enquiries in the active list, propose moving the first enquiry (or ask which one).
- In spoken or voice recognition input, phrases like "name is flicker quantities 2" or "product name flicker quantity 2":
  * Product name must be cleaned to "flicker" (strip "name is", "product name", "item is", "part name", etc.).
  * "quantities 2" or "quantity 2" or "quantity is 2" means qty: 2.
  * NEVER leave conversational words like "name is" or "quantities 2" inside the product name string!
- If the user refers to an enquiry by customer name or product (e.g., "change AABEE enquiry quantity to 20") and AABEE has lead_no 1025 in the active list, resolve identifier to "1025".
- If the user says "delete enquiry 1025" or "1025 enquiry delete pannu", use intent "delete_enquiry" with identifier "1025".
- If user wants to see/list the pipeline cards, use "list_pipeline".
- Always output valid JSON only.`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4).map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.text,
    })),
    { role: 'user', content: message },
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      console.warn('OpenAI API error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) return null;

    const parsed = JSON.parse(rawContent);
    const intent = String(parsed.intent || 'unknown') as Intent;
    const params = (parsed.params && typeof parsed.params === 'object' ? parsed.params : {}) as Params;
    const reply = String(parsed.reply || '');

    // Sanitize products if returned
    if (params.products && Array.isArray(params.products)) {
      params.products = params.products.map((p: any) => {
        let name = String(p.name || '').trim();
        name = name.replace(/^(?:(?:the\s+)?(?:product|part|item)\s*(?:name)?|(?:product|part|item)?\s*name)\s*(?:is|as|are|to|[:;\-=])?\s*/i, '');
        let qty = p.qty;
        if (qty == null || qty === 0) {
          const qm = /(?:x|×|\*|\b(?:qty|quantit(?:y|ies)|குவாண்டிட்டி|அளவு|எண்ணிக்கை|count)\b)\s*(?:is|are|as|to|[:\-=])?\s*(\d+(?:\.\d+)?)/i.exec(name);
          if (qm) {
            qty = Number(qm[1]);
            name = name.slice(0, qm.index).trim();
          }
        }
        return { ...p, name: name.trim(), qty };
      });
    }

    return { intent, params, reply };
  } catch (err) {
    console.warn('Failed to call OpenAI API:', err);
    return null;
  }
}
