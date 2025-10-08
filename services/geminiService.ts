import { GoogleGenAI, Type } from "@google/genai";
import { EmailFormData, CancellationData, Agent, Opportunity, VideoOperation } from '../types';
import { AGENCY_DETAILS, EMAIL_STYLES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const model = 'gemini-2.5-flash';

const systemInstruction = `You are an expert insurance marketing assistant for the Bill Layne Insurance Agency. 
Your tone should be professional, helpful, and aligned with the user's selection (Warm, Direct, Short). 
You will generate content for a Gmail-compatible HTML email.
Use the provided agency details and customer information to personalize the email. All links must be functional.
Subtly incorporate emojis where appropriate to enhance the message.`;

export const generateSubjectLines = async (formData: EmailFormData): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `
        Based on the following details, generate 3 distinct and effective email subject line options.
        
        Email Purpose: ${formData.documentType}
        Policy Holder: ${formData.policyHolder || 'Not specified'}
        Agency Name: ${AGENCY_DETAILS.shortName}
      `,
      config: {
        systemInstruction: `You are an expert copywriter specializing in email subject lines for an insurance agency.
        Generate 3 distinct and effective subject line options based on the provided details.
        Consider adding a relevant emoji at the start of one or two suggestions to improve engagement.
        Return the response as a valid JSON array of strings.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
          },
        },
      }
    });

    const jsonText = response.text.trim();
    const subjects = JSON.parse(jsonText);
    return Array.isArray(subjects) ? subjects : [];
  } catch (error) {
    console.error("Error generating subject lines:", error);
    return [];
  }
};

export const generatePreheaders = async (formData: EmailFormData): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `
        Based on the following email details, generate 3 short, engaging preheader text options.
        Preheaders are the snippets of text that appear after the subject line in an inbox. They should be compelling and concise (under 100 characters).

        Email Purpose: ${formData.documentType}
        Email Subject: ${formData.emailSubject}
        Policy Holder: ${formData.policyHolder || 'Not specified'}
      `,
      config: {
        systemInstruction: `You are an expert copywriter specializing in email preheaders for an insurance agency.
        Generate 3 distinct preheader options based on the provided details.
        The goal is to increase open rates by providing a compelling preview of the email's content.
        Return the response as a valid JSON array of strings.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
          },
        },
      }
    });

    const jsonText = response.text.trim();
    const preheaders = JSON.parse(jsonText);
    return Array.isArray(preheaders) ? preheaders : [];
  } catch (error) {
    console.error("Error generating preheaders:", error);
    return [];
  }
};

export const generateEmailBody = async (formData: EmailFormData, agent: Agent): Promise<string> => {
  let specialInstructions = '';
  let recipientNameForPrompt = formData.recipientName || 'Valued Client';

  if (formData.documentType === 'Change / Underwriting Request') {
    if (formData.changeRequestType === 'request') {
      specialInstructions = `
        **CRITICAL INSTRUCTIONS: This is a CHANGE REQUEST being sent TO an insurance company, NOT to a customer.**
        - The audience is an underwriting department or a carrier.
        - The salutation MUST be formal and generic (e.g., "To Whom It May Concern," or "To the Progressive Underwriting Team,").
        - DO NOT use the recipient's first name. The 'Recipient's First Name' field provided below is a placeholder and MUST be ignored.
        - The body must clearly state the requested change for the specified policyholder and policy number.
        - Mention any attachments as described in the user's prompt.
        - The tone must be direct, professional, and clear.
      `;
      // Override recipient name to make it clear to the AI it's not a person's name for salutation
      recipientNameForPrompt = '[IGNORE - Address to company/underwriting]';
    } else { // 'confirmation'
      specialInstructions = `
        **CRITICAL INSTRUCTIONS: This is a CONFIRMATION email being sent TO a customer.**
        - The audience is the insurance customer.
        - The salutation MUST use the customer's first name provided in the 'Recipient's First Name' field.
        - Clearly confirm that a change has been made or is in process.
        - The tone should match the user's selection (Warm, Direct, etc.).
      `;
    }
  }

  const prompt = `
    Generate a complete, Gmail-compatible HTML email body based on the following information.
    Do not include <html>, <head>, or <body> tags. Only generate the content that goes inside the main content <td>.
    
    **Key Instructions:**
    1.  **NO DOCUMENT BUTTONS:** Do NOT generate any HTML buttons for downloading or accessing documents. All documents are sent as separate PDF attachments. A simple text mention (e.g., "Please find your documents attached.") is all that is needed.
    2.  **USE EMOJIS SUBTLY:** Include one or two relevant emojis to make the email more engaging, but do not overdo it. For example: 🗓️ for renewals, 📄 for documents, ✨ for quotes.
    3.  **NO HERO IMAGE:** Do NOT generate the hero image HTML. The application's template handles this separately.

    ${specialInstructions}

    Use HTML tags like <p>, <strong>, <a>, etc. for formatting. Ensure all links have the 'style' attribute for compatibility.
    Primary link color should be ${process.env.NODE_ENV === 'dark' ? EMAIL_STYLES.dark.primaryLink : EMAIL_STYLES.primaryColor}.

    **Email Details:**
    - Purpose: ${formData.documentType}
    - Tone: ${formData.tone}
    - Recipient's First Name: ${recipientNameForPrompt}
    - Policy Holder Name: ${formData.policyHolder || 'N/A'}

    **Contextual Information:**
    ${formData.documentType === 'Insurance Quote' ? `- Quote Type: ${formData.quoteType}\n- Quote Amount: ${formData.quoteAmount}\n- Coverage Starts: ${formData.coverageStart}\n- Quote Expires: ${formData.quoteExpires}` : ''}
    ${formData.documentType === 'Policy Renewal' ? `- Renewal Due: ${formData.renewalDue}` : ''}
    ${['Custom Message', 'Promotional / Newsletter', 'AI Prompt', 'Auto Documentation', 'Home Documentation', 'Commercial Documentation', 'General Documentation', 'Change / Underwriting Request'].includes(formData.documentType) ? `- User's Core Message/Prompt: ${formData.customPrompt}` : ''}
    ${formData.selectedOpportunityPrompt ? `- **Additional Context to Weave In:** "${formData.selectedOpportunityPrompt}"` : ''}
    ${formData.heroUrl ? `- A hero image with alt text "${formData.heroAlt}" will be placed at the top of the email.` : ''}

    **Agency Information to use:**
    - Agency Name: ${AGENCY_DETAILS.name}
    - Sender Name (for signature): ${agent.name}
    - Sender Title: ${agent.title}
    - Phone: ${agent.phone}
    - Email: ${agent.email}
    - Website: ${AGENCY_DETAILS.website}

    Now, generate the HTML email body, following all instructions above. The sign-off should be from the sender.
  `;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Error generating email body:", error);
    return "<p>Error generating content. Please try again.</p>";
  }
};

export const generateHomeQuoteProse = async (formData: EmailFormData): Promise<{ greeting: string, intro: string, ctaText: string } | null> => {
    const prompt = `
      Based on the following home insurance quote details, generate some brief, friendly, and professional text snippets for an email.
      
      - Recipient Name: ${formData.recipientName}
      - Annual Premium: ${formData.quoteAmount}
      - Monthly Premium: ${formData.monthlyPremium}
      - Property Address: ${formData.propertyAddress}
      - Policy Type: ${formData.homePolicyType || 'Home'}
      - Is this an updated quote?: ${formData.isUpdatedQuote}
      - Tone: ${formData.tone}
      ${formData.selectedOpportunityPrompt ? `- **Additional Context to Weave In:** Also, seamlessly incorporate the following advice into the 'intro' paragraph: "${formData.selectedOpportunityPrompt}"` : ''}
  
      Generate the following three pieces of text:
      1. 'greeting': A short, personalized greeting. If it's an updated quote, explicitly mention that. Also mention the policy type. Example: "Hi ${formData.recipientName}, here is your updated ${formData.homePolicyType} quote!"
      2. 'intro': A short paragraph to be placed after the price, before the coverage details. It should mention the property address. If additional context is provided, weave it in naturally here. Example: "This policy for your home at ${formData.propertyAddress} includes several key endorsements and discounts. Your detailed coverage is below."
      3. 'ctaText': A short, encouraging sentence to be placed before the main call-to-action button. Example: "Your personalized quote is valid for 30 days. Click the button below to start your policy!"
  
      Return the response as a single, valid JSON object with keys "greeting", "intro", and "ctaText".
    `;
  
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: "You are a helpful and concise insurance marketing copywriter.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              greeting: { type: Type.STRING },
              intro: { type: Type.STRING },
              ctaText: { type: Type.STRING },
            },
            required: ["greeting", "intro", "ctaText"],
          },
        },
      });
      const jsonText = response.text.trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error("Error generating home quote prose:", error);
      return null;
    }
  };

export const generateAutoQuoteProse = async (formData: EmailFormData): Promise<{ greeting: string, intro: string, ctaText: string } | null> => {
    const prompt = `
      Based on the following auto insurance quote details, generate some brief, friendly, and professional text snippets for an email.
      
      - Recipient Name: ${formData.recipientName}
      - Total Premium: ${formData.quoteAmount}
      - Monthly Premium: ${formData.monthlyPremium}
      - Vehicles: ${formData.autoVehicles}
      - Tone: ${formData.tone}
      ${formData.selectedOpportunityPrompt ? `- **Additional Context to Weave In:** Also, seamlessly incorporate the following advice into the 'intro' paragraph: "${formData.selectedOpportunityPrompt}"` : ''}
  
      Generate the following three pieces of text:
      1. 'greeting': A short, personalized greeting. e.g., "Hi ${formData.recipientName}, your personal auto quote is ready! 🚗"
      2. 'intro': A short paragraph to be placed after the price, before the coverage details. It should mention the vehicle(s). If additional context is provided, weave it in naturally here. e.g., "This policy for your ${formData.autoVehicles} includes comprehensive protection and several discounts. Your detailed coverage is below."
      3. 'ctaText': A short, encouraging sentence to be placed before the main call-to-action button. e.g., "This personalized rate is valid for 30 days. Let's get you covered and back on the road safely!"
  
      Return the response as a single, valid JSON object with keys "greeting", "intro", and "ctaText".
    `;
  
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: "You are a helpful and concise insurance marketing copywriter.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              greeting: { type: Type.STRING },
              intro: { type: Type.STRING },
              ctaText: { type: Type.STRING },
            },
            required: ["greeting", "intro", "ctaText"],
          },
        },
      });
      const jsonText = response.text.trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error("Error generating auto quote prose:", error);
      return null;
    }
  };

export const generateHeroImage = async (prompt: string): Promise<string | null> => {
  if (!prompt) return null;
  try {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '16:9', // Good aspect ratio for email heroes
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      return `data:image/jpeg;base64,${base64ImageBytes}`;
    }
    return null;
  } catch (error) {
    console.error("Error generating hero image:", error);
    return null;
  }
};

export const generateVideo = async (prompt: string, onProgress: (status: string) => void): Promise<string | null> => {
    if (!prompt) return null;
    try {
        onProgress("Initiating video generation with Veo...");
        let operation: VideoOperation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: prompt,
            config: { numberOfVideos: 1 }
        });

        onProgress("Video is in the queue. This may take a few minutes...");
        
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
            onProgress("AI is rendering your video...");
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }
        
        onProgress("Processing complete!");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        
        if (downloadLink) {
            return downloadLink;
        } else {
            console.error("Video generation finished but no download link found.", operation);
            return null;
        }
    } catch (error) {
        console.error("Error generating video:", error);
        return null;
    }
};

// Helper function to convert File to a GenerativePart for multimodal input
async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string; } }> {
  const base64EncodedData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type,
    },
  };
}

export const generatePromptFromPdf = async (pdfFile: File): Promise<{ policyHolder: string; recipientName: string; customPrompt: string; } | null> => {
    const pdfPart = await fileToGenerativePart(pdfFile);

    const prompt = `
        You are an expert insurance assistant tasked with communicating with a client.
        Analyze the attached PDF document, which could be a policy change, receipt, claim update, ID card, etc.

        Your task is to do three things and return them in a JSON object:
        1.  **policyHolder**: Extract the full name of the policyholder (e.g., "Johnathan Doe"). If not found, return an empty string.
        2.  **recipientName**: Extract the first name of the policyholder (e.g., "Johnathan"). If not found, return an empty string.
        3.  **customPrompt**: Generate a clear, professional email body that explains the contents of this document to the policyholder. Summarize the key information. Do NOT include greetings or sign-offs, just the core message.

        Return a single, valid JSON object with the keys "policyHolder", "recipientName", and "customPrompt".
    `;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [{ text: prompt }, pdfPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        policyHolder: { type: Type.STRING },
                        recipientName: { type: Type.STRING },
                        customPrompt: { type: Type.STRING },
                    },
                    required: ["policyHolder", "recipientName", "customPrompt"],
                },
            }
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error generating prompt from PDF:", error);
        return null;
    }
};

export const extractQuoteFromPdf = async (pdfFile: File): Promise<Partial<EmailFormData> | null> => {
    const pdfPart = await fileToGenerativePart(pdfFile);

    const prompt = `
        You are a highly accurate data extraction specialist for an insurance agency.
        Analyze the provided homeowners insurance quote PDF.
        Extract the following key pieces of information. If a value is not found, use an empty string "".

        - carrierName: The name of the insurance carrier company. Look for the company name in the letterhead, header, or near a logo. Common carriers include Nationwide, Progressive, National General, Foremost, etc.
        - homePolicyType: The specific type or form of the policy. Look for terms like "HO-3", "Dwelling Fire", "Mobile Home", "DP-3", "HO-5", etc.
        - policyHolder: Policy Holder's full name.
        - recipientName: Policy Holder's first name.
        - propertyAddress: The full property address being insured.
        - quoteAmount: The annual premium or total price. Format as a currency string like "$1,072.00".
        - monthlyPremium: Calculate this by dividing the annual premium by 12. Format as a currency string like "$89.33".
        - coverageStart: The proposed effective date for the new policy. Look for labels like "Effective Date", "Policy Start Date", or "Coverage Begins". Parse various date formats (e.g., MM/DD/YYYY, Month Day, YYYY) and convert to YYYY-MM-DD.
        - quoteExpires: The date the quote is no longer valid. Look for labels like "Quote Valid Until", "Expires On", "Good Through". This might be a specific date or calculated from the quote date (e.g., "Good for 30 days"). Format as YYYY-MM-DD.
        - dwellingCoverage: Dwelling coverage amount. Format as a currency string like "$360,000".
        - otherStructuresCoverage: Other Structures coverage amount.
        - personalPropertyCoverage: Personal Property coverage amount.
        - lossOfUseCoverage: Loss of Use coverage amount.
        - personalLiabilityCoverage: Personal Liability coverage amount.
        - medicalPaymentsCoverage: Medical Payments coverage amount.
        - deductible: The primary deductible amount (e.g., "$1,000 All Perils").

        Return the data as a single, valid JSON object matching the specified schema.
    `;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [ { text: prompt }, pdfPart ] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        carrierName: { type: Type.STRING },
                        homePolicyType: { type: Type.STRING },
                        policyHolder: { type: Type.STRING },
                        recipientName: { type: Type.STRING },
                        propertyAddress: { type: Type.STRING },
                        quoteAmount: { type: Type.STRING },
                        monthlyPremium: { type: Type.STRING },
                        coverageStart: { type: Type.STRING },
                        quoteExpires: { type: Type.STRING },
                        dwellingCoverage: { type: Type.STRING },
                        otherStructuresCoverage: { type: Type.STRING },
                        personalPropertyCoverage: { type: Type.STRING },
                        lossOfUseCoverage: { type: Type.STRING },
                        personalLiabilityCoverage: { type: Type.STRING },
                        medicalPaymentsCoverage: { type: Type.STRING },
                        deductible: { type: Type.STRING },
                    },
                    required: [
                        "carrierName", "homePolicyType", "policyHolder", "recipientName", "propertyAddress", "quoteAmount", "monthlyPremium",
                        "coverageStart", "quoteExpires", "dwellingCoverage", "otherStructuresCoverage",
                        "personalPropertyCoverage", "lossOfUseCoverage", "personalLiabilityCoverage",
                        "medicalPaymentsCoverage", "deductible"
                    ]
                }
            }
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as Partial<EmailFormData>;

    } catch (error) {
        console.error("Error extracting quote from PDF:", error);
        return null;
    }
};

export const extractAutoQuoteFromPdf = async (pdfFile: File): Promise<Partial<EmailFormData> | null> => {
    const pdfPart = await fileToGenerativePart(pdfFile);

    const prompt = `
        You are a highly accurate data extraction specialist for an insurance agency.
        Analyze the provided AUTO insurance quote PDF.
        Extract the following key pieces of information. If a value is not found, use an empty string "".

        - carrierName: The name of the insurance carrier company. Look for the company name in the letterhead, header, or near a logo. Common carriers include Nationwide, Progressive, National General, Foremost, etc.
        - policyHolder: Policy Holder's full name.
        - recipientName: Policy Holder's first name.
        - quoteAmount: The total premium for the policy term. Format as a currency string like "$1,250.00".
        - policyTerm: Look for a "Policy Period" or "Term" specified, often with a start and end date (e.g., "12/01/2024 to 06/01/2025"). Calculate the duration in months. It will typically be 6 or 12. Return the string '6' or '12'. Default to '12' if not specified.
        - monthlyPremium: Calculate this by dividing the total premium by the determined policyTerm. Format as a currency string like "$104.17".
        - autoVehicles: A list of the vehicles covered, formatted as a single string, e.g., "2023 Toyota Camry, 2021 Ford F-150".
        - autoDrivers: A list of the drivers covered, formatted as a single string, e.g., "John Doe, Jane Doe".
        - itemizedCoveragesHtml: A clean, responsive HTML <div> block that itemizes the coverages for EACH vehicle listed in the quote. For each vehicle, create a sub-header (e.g., <h4>2024 Toyota Camry</h4>). Then, list its specific coverages (like Bodily Injury, Collision Deductible, Comprehensive Deductible, etc.) and their corresponding values in a structured, easy-to-read format like a <table> or styled <div> rows. Use professional inline styles (e.g., padding, borders). Do NOT include <html>, <body>, or <style> tags, only the content inside a single parent <div>. If a coverage applies to all vehicles, you can state that.

        Return the data as a single, valid JSON object matching the specified schema.
    `;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [ { text: prompt }, pdfPart ] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        carrierName: { type: Type.STRING },
                        policyHolder: { type: Type.STRING },
                        recipientName: { type: Type.STRING },
                        quoteAmount: { type: Type.STRING },
                        policyTerm: { type: Type.STRING },
                        monthlyPremium: { type: Type.STRING },
                        autoVehicles: { type: Type.STRING },
                        autoDrivers: { type: Type.STRING },
                        itemizedCoveragesHtml: { type: Type.STRING },
                    },
                    required: [
                        "carrierName", "policyHolder", "recipientName", "quoteAmount", "policyTerm", "monthlyPremium", "autoVehicles", "autoDrivers", "itemizedCoveragesHtml"
                    ]
                }
            }
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as Partial<EmailFormData>;

    } catch (error) {
        console.error("Error extracting auto quote from PDF:", error);
        return null;
    }
};

export const extractRenewalInfoFromPdf = async (pdfFile: File): Promise<Partial<EmailFormData> | null> => {
    const pdfPart = await fileToGenerativePart(pdfFile);

    const prompt = `
        You are a highly accurate data extraction specialist for an insurance agency.
        Analyze the provided policy RENEWAL document PDF.
        First, determine if the policy is for 'Home' or 'Auto'. Set the 'renewalType' field accordingly.
        Then, extract the following key pieces of information. If a value is not found, use an empty string "".

        **Always Extract These:**
        - carrierName: The name of the insurance carrier company. Look for the company name in the letterhead, header, or near a logo. Common carriers include Nationwide, Progressive, National General, Foremost, etc.
        - policyHolder: Policy Holder's full name.
        - recipientName: Policy Holder's first name.
        - policyNumber: The full policy number. It's critical. Look for labels like "Policy Number", "Policy #", or "Policy:". It is often at the top of the document and can be alphanumeric.
        - quoteAmount: The new total premium or total renewal cost (e.g., "$1,310.00").
        - previousQuoteAmount: **CRITICAL**: Find the expiring term's premium for comparison. Look for labels like "Current Premium", "Prior Term Premium", "Expiring Premium", or a summary table comparing old and new costs. Format as a currency string like "$1,250.00".
        - renewalDue: The policy effective date for the new term. Look for labels like "Effective Date", "Renewal Date", "Policy Period", "Term Begins", or a date range (e.g., "12/01/2024 to 12/01/2025"). Use the starting date of the new term. Parse various date formats (e.g., MM/DD/YYYY, Month Day, YYYY) and convert to YYYY-MM-DD.
        - renewalType: The type of policy, must be one of "Home", "Auto", or "Other".
        - monthlyPremium: Calculated monthly cost. For Home, this is quoteAmount / 12. For Auto, divide by the policy term. Format as a currency string like "$109.17".
        - policyTerm: For Home, this is always '12'. For Auto, determine if the term is 6 or 12 months from the policy dates (e.g., "12/01/2024 to 06/01/2025" is 6 months) and return '6' or '12'.

        **If it is a HOME policy, also extract:**
        - propertyAddress: The full property address being insured.
        - dwellingCoverage: Dwelling coverage amount (e.g., "$360,000").
        - otherStructuresCoverage: Other Structures coverage amount.
        - personalPropertyCoverage: Personal Property coverage amount.
        - lossOfUseCoverage: Loss of Use coverage amount.
        - personalLiabilityCoverage: Personal Liability coverage amount.
        - medicalPaymentsCoverage: Medical Payments coverage amount.
        - deductible: The primary deductible amount (e.g., "$1,000 All Perils").

        **If it is an AUTO policy, also extract:**
        - autoVehicles: A list of the vehicles covered, as a single string (e.g., "2023 Toyota Camry, 2021 Ford F-150").
        - autoDrivers: A list of the drivers covered, as a single string (e.g., "John Doe, Jane Doe").
        - itemizedCoveragesHtml: A clean, responsive HTML <div> block that itemizes the coverages for EACH vehicle listed in the quote. For each vehicle, create a sub-header (e.g., <h4>2024 Toyota Camry</h4>). Then, list its specific coverages (like Bodily Injury, Collision Deductible, Comprehensive Deductible, etc.) and their corresponding values in a structured, easy-to-read format like a <table> or styled <div> rows. Use professional inline styles (e.g., padding, borders). Do NOT include <html>, <body>, or <style> tags, only the content inside a single parent <div>. If a coverage applies to all vehicles, you can state that.

        Return all extracted data as a single, valid JSON object matching the specified schema.
    `;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [ { text: prompt }, pdfPart ] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        carrierName: { type: Type.STRING },
                        policyHolder: { type: Type.STRING },
                        recipientName: { type: Type.STRING },
                        policyNumber: { type: Type.STRING },
                        quoteAmount: { type: Type.STRING },
                        previousQuoteAmount: { type: Type.STRING },
                        renewalDue: { type: Type.STRING },
                        renewalType: { type: Type.STRING },
                        monthlyPremium: { type: Type.STRING },
                        policyTerm: { type: Type.STRING },
                        propertyAddress: { type: Type.STRING },
                        dwellingCoverage: { type: Type.STRING },
                        otherStructuresCoverage: { type: Type.STRING },
                        personalPropertyCoverage: { type: Type.STRING },
                        lossOfUseCoverage: { type: Type.STRING },
                        personalLiabilityCoverage: { type: Type.STRING },
                        medicalPaymentsCoverage: { type: Type.STRING },
                        deductible: { type: Type.STRING },
                        autoVehicles: { type: Type.STRING },
                        autoDrivers: { type: Type.STRING },
                        itemizedCoveragesHtml: { type: Type.STRING },
                    },
                    required: [
                        "carrierName", "policyHolder", "recipientName", "policyNumber", "quoteAmount", "renewalDue", "renewalType", "monthlyPremium", "policyTerm", "previousQuoteAmount"
                    ]
                }
            }
        });

        const jsonText = response.text.trim();
        const data = JSON.parse(jsonText) as Partial<EmailFormData>;
        if (data.renewalDue && data.renewalDue.length === 10) { // YYYY-MM-DD
            data.renewalDue = `${data.renewalDue}T00:01`;
        }
        return data;

    } catch (error) {
        console.error("Error extracting renewal info from PDF:", error);
        return null;
    }
};

export const extractNewPolicyInfoFromPdf = async (pdfFile: File): Promise<Partial<EmailFormData> | null> => {
    const pdfPart = await fileToGenerativePart(pdfFile);

    const prompt = `
        You are a highly accurate data extraction specialist for an insurance agency.
        Analyze the provided NEW POLICY application or declaration page PDF.
        First, determine if the policy is for 'Home' or 'Auto'. Set the 'renewalType' field accordingly.
        Then, extract the following key pieces of information. If a value is not found, use an empty string "".

        **Always Extract These:**
        - carrierName: The name of the insurance carrier company (e.g., Nationwide, Progressive, National General).
        - policyHolder: The full name of the primary insured.
        - recipientName: The first name of the primary insured.
        - policyNumber: The full policy number. This is critical.
        - policyEffectiveDate: The policy effective date. Look for labels like "Effective Date", "Policy Start Date". Parse various date formats and convert to YYYY-MM-DD.
        - renewalType: The type of policy, must be one of "Home", "Auto", or "Other".
        - quoteAmount: The total premium (e.g., "$1,310.00").
        - monthlyPremium: Calculated monthly cost. For Home, this is quoteAmount / 12. For Auto, divide by the policy term. Format as a currency string like "$109.17".
        - policyTerm: For Home, this is always '12'. For Auto, determine if the term is 6 or 12 months from the policy dates and return '6' or '12'.

        **If it is a HOME policy, also extract:**
        - propertyAddress: The full property address being insured.
        - dwellingCoverage: Dwelling coverage amount (e.g., "$360,000").
        - otherStructuresCoverage: Other Structures coverage amount.
        - personalPropertyCoverage: Personal Property coverage amount.
        - lossOfUseCoverage: Loss of Use coverage amount.
        - personalLiabilityCoverage: Personal Liability coverage amount.
        - medicalPaymentsCoverage: Medical Payments coverage amount.
        - deductible: The primary deductible amount (e.g., "$1,000 All Perils").

        **If it is an AUTO policy, also extract:**
        - autoVehicles: A list of the vehicles covered, as a single string (e.g., "2023 Toyota Camry, 2021 Ford F-150").
        - autoDrivers: A list of the drivers covered, as a single string (e.g., "John Doe, Jane Doe").
        - itemizedCoveragesHtml: A clean, responsive HTML <div> block that itemizes the coverages for EACH vehicle listed in the document. For each vehicle, create a sub-header (e.g., <h4>2024 Toyota Camry</h4>). Then, list its specific coverages (like Bodily Injury, Collision Deductible, Comprehensive Deductible, etc.) and their corresponding values in a structured, easy-to-read format like a <table> or styled <div> rows. Use professional inline styles (e.g., padding, borders). Do NOT include <html>, <body>, or <style> tags, only the content inside a single parent <div>. If a coverage applies to all vehicles, you can state that.

        Return all extracted data as a single, valid JSON object.
    `;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [ { text: prompt }, pdfPart ] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        carrierName: { type: Type.STRING },
                        policyHolder: { type: Type.STRING },
                        recipientName: { type: Type.STRING },
                        policyNumber: { type: Type.STRING },
                        policyEffectiveDate: { type: Type.STRING },
                        renewalType: { type: Type.STRING },
                        quoteAmount: { type: Type.STRING },
                        monthlyPremium: { type: Type.STRING },
                        policyTerm: { type: Type.STRING },
                        propertyAddress: { type: Type.STRING },
                        dwellingCoverage: { type: Type.STRING },
                        otherStructuresCoverage: { type: Type.STRING },
                        personalPropertyCoverage: { type: Type.STRING },
                        lossOfUseCoverage: { type: Type.STRING },
                        personalLiabilityCoverage: { type: Type.STRING },
                        medicalPaymentsCoverage: { type: Type.STRING },
                        deductible: { type: Type.STRING },
                        autoVehicles: { type: Type.STRING },
                        autoDrivers: { type: Type.STRING },
                        itemizedCoveragesHtml: { type: Type.STRING },
                    },
                    required: [
                        "carrierName", "policyHolder", "recipientName", "policyNumber", "policyEffectiveDate", "renewalType", "quoteAmount", "monthlyPremium", "policyTerm"
                    ]
                }
            }
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as Partial<EmailFormData>;

    } catch (error) {
        console.error("Error extracting new policy info from PDF:", error);
        return null;
    }
};

export const extractCancellationsFromPdf = async (pdfFile: File): Promise<CancellationData[] | null> => {
    const pdfPart = await fileToGenerativePart(pdfFile);

    const prompt = `
        You are a highly accurate data extraction specialist for an insurance agency.
        Analyze the provided PDF document of a "Pending Cancellations" report, which is in a tabular format.
        Extract the data for each row into a valid JSON array of objects.
        Each object in the array should represent one person/row and contain the following keys:

        - "policyNumber": The value from the "Policy" column.
        - "namedInsured": The value from the "Named Insured" column.
        - "cancellationDate": The value from the "Cancel Date" column (keep the MM/DD/YYYY format).
        - "amountDue": The value from the "Amount Due" column (keep the currency format like "$295.77").

        Ignore the header row of the table. Ensure the output is only the JSON array.
    `;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [ { text: prompt }, pdfPart ] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            policyNumber: { type: Type.STRING },
                            namedInsured: { type: Type.STRING },
                            cancellationDate: { type: Type.STRING },
                            amountDue: { type: Type.STRING },
                        },
                        required: ["policyNumber", "namedInsured", "cancellationDate", "amountDue"]
                    }
                }
            }
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as CancellationData[];

    } catch (error) {
        console.error("Error extracting cancellations from PDF:", error);
        return null;
    }
};

export const extractReceiptInfoFromPdf = async (pdfFile: File): Promise<Partial<EmailFormData> | null> => {
    const pdfPart = await fileToGenerativePart(pdfFile);
    const prompt = `
        You are a highly accurate data extraction specialist for an insurance agency.
        Analyze the provided payment receipt PDF. Extract the following key pieces of information. 
        If a value is not found, use an empty string "".

        - carrierName: The brand name of the insurance carrier company. This is the main, well-known name, often found at the top of the document (e.g., 'National General', 'Nationwide', 'Progressive'). If you see multiple company names, prioritize this brand name over a more obscure underwriting company name (e.g., prefer 'National General' over 'Integon Preferred Insurance Company').
        - policyHolder: The full name of the policyholder.
        - recipientName: The first name of the policyholder.
        - policyNumber: The full policy number.
        - receiptAmount: The amount paid. Format as a currency string like "$123.45".
        - receiptDatePaid: The date the payment was made. Parse various formats and convert to YYYY-MM-DD.
        - receiptConfirmationNumber: The confirmation or transaction number.
        - receiptPaymentMethod: The method of payment (e.g., "Visa **** 1234", "Bank Account").
        - receiptProduct: The type of insurance paid for. Should be one of "Auto", "Home", "Commercial", "Other".

        Return the data as a single, valid JSON object.
    `;
    try {
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [{ text: prompt }, pdfPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        carrierName: { type: Type.STRING },
                        policyHolder: { type: Type.STRING },
                        recipientName: { type: Type.STRING },
                        policyNumber: { type: Type.STRING },
                        receiptAmount: { type: Type.STRING },
                        receiptDatePaid: { type: Type.STRING },
                        receiptConfirmationNumber: { type: Type.STRING },
                        receiptPaymentMethod: { type: Type.STRING },
                        receiptProduct: { type: Type.STRING },
                    },
                    required: ["carrierName", "policyHolder", "recipientName", "policyNumber", "receiptAmount", "receiptDatePaid", "receiptConfirmationNumber", "receiptPaymentMethod", "receiptProduct"]
                }
            }
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as Partial<EmailFormData>;
    } catch (error) {
        console.error("Error extracting receipt info from PDF:", error);
        return null;
    }
};

export const extractReceiptInfoFromText = async (text: string): Promise<Partial<EmailFormData> | null> => {
    const prompt = `
        You are a highly accurate data extraction specialist for an insurance agency.
        Analyze the provided text from a payment receipt. Extract the following key pieces of information. 
        If a value is not found, use an empty string "".

        - carrierName: The brand name of the insurance carrier company. This is the main, well-known name, often found at the top of the document (e.g., 'National General', 'Nationwide', 'Progressive'). If you see multiple company names, prioritize this brand name over a more obscure underwriting company name (e.g., prefer 'National General' over 'Integon Preferred Insurance Company').
        - policyHolder: The full name of the policyholder.
        - recipientName: The first name of the policyholder.
        - policyNumber: The full policy number.
        - receiptAmount: The amount paid. Format as a currency string like "$123.45".
        - receiptDatePaid: The date the payment was made. Parse various formats and convert to YYYY-MM-DD.
        - receiptConfirmationNumber: The confirmation or transaction number.
        - receiptPaymentMethod: The method of payment (e.g., "Visa **** 1234", "Bank Account").
        - receiptProduct: The type of insurance paid for. Should be one of "Auto", "Home", "Commercial", "Other".

        Here is the text to analyze:
        ---
        ${text}
        ---

        Return the data as a single, valid JSON object.
    `;
    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        carrierName: { type: Type.STRING },
                        policyHolder: { type: Type.STRING },
                        recipientName: { type: Type.STRING },
                        policyNumber: { type: Type.STRING },
                        receiptAmount: { type: Type.STRING },
                        receiptDatePaid: { type: Type.STRING },
                        receiptConfirmationNumber: { type: Type.STRING },
                        receiptPaymentMethod: { type: Type.STRING },
                        receiptProduct: { type: Type.STRING },
                    },
                    required: ["carrierName", "policyHolder", "recipientName", "policyNumber", "receiptAmount", "receiptDatePaid", "receiptConfirmationNumber", "receiptPaymentMethod", "receiptProduct"]
                }
            }
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as Partial<EmailFormData>;
    } catch (error) {
        console.error("Error extracting receipt info from text:", error);
        return null;
    }
};

export const extractChangeInfoFromText = async (text: string): Promise<Partial<EmailFormData> | null> => {
    const prompt = `
        You are a highly accurate data extraction specialist for an insurance agency.
        Analyze the provided text, which could be an email, a note, or a document snippet regarding a policy change request or an underwriting memo.
        Extract the following key pieces of information. If a value is not found, use an empty string "".

        - carrierName: The brand name of the insurance carrier company (e.g., 'National General', 'Nationwide', 'Progressive').
        - policyHolder: The full name of the policyholder.
        - recipientName: The first name of the policyholder.
        - policyNumber: The full policy number.
        - customPrompt: A clear, professional summary of the change being requested or confirmed. This should be suitable for the body of an email. For example, "This email confirms the requested change to add the 2024 Honda CRV to your auto policy, effective today." or "We have received the attached document from underwriting and need to discuss an update to your policy."

        Here is the text to analyze:
        ---
        ${text}
        ---

        Return the data as a single, valid JSON object.
    `;
    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        carrierName: { type: Type.STRING },
                        policyHolder: { type: Type.STRING },
                        recipientName: { type: Type.STRING },
                        policyNumber: { type: Type.STRING },
                        customPrompt: { type: Type.STRING },
                    },
                    required: ["carrierName", "policyHolder", "recipientName", "policyNumber", "customPrompt"]
                }
            }
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as Partial<EmailFormData>;
    } catch (error) {
        console.error("Error extracting change info from text:", error);
        return null;
    }
};


export const generateOpportunities = async (formData: EmailFormData): Promise<Opportunity[]> => {
    const prompt = `
      Act as an expert insurance agent reviewing a client's policy information to find opportunities for up-selling or cross-selling.
      Based on the provided data, identify up to 2 valuable recommendations you would make to this client.
      
      **Client Data:**
      - Document Type: ${formData.documentType}
      - Quote Type: ${formData.quoteType || formData.renewalType}
      - Home Dwelling Coverage: ${formData.dwellingCoverage || 'N/A'}
      - Home Personal Liability: ${formData.personalLiabilityCoverage || 'N/A'}
      - Auto Bodily Injury Limits: ${formData.autoBodilyInjury || 'N/A'}
      - Bundled: ${ (formData.documentType === 'Policy Renewal' && formData.renewalType === 'Home' && formData.autoVehicles) ? 'Yes (has both)' : 'Potentially no.'}
      - Other Details: ${formData.endorsements || formData.autoExtraCoverages || 'None specified.'}
  
      **Your Task:**
      Return a JSON array of objects, where each object represents one opportunity. Each object must have three keys:
      1.  "title": A short, catchy title for the opportunity (e.g., "Umbrella Policy Needed").
      2.  "suggestionText": A brief, one-sentence explanation of WHY you are suggesting this, for the agent to see (e.g., "Client has high-value home but standard liability.").
      3.  "promptToInject": The professional, client-facing text to be added to the email. Frame it as helpful advice. (e.g., "Given the value of your property, I also highly recommend we discuss an Umbrella Liability policy. It's an affordable way to add an extra layer of protection over and above your standard home and auto limits.").
  
      **Examples of Opportunities to look for:**
      - If Dwelling coverage is high (e.g., > $500k) or Personal liability is high, suggest an Umbrella policy.
      - If Auto Bodily Injury limits are low (e.g., state minimum like '25k/50k'), recommend increasing them and explain the benefit.
      - If the client is getting a Home quote but has vehicles listed, suggest bundling for a discount.
      - If the client is renewing an Auto policy, suggest a quote for Home/Renters insurance to get a multi-policy discount.
      
      Analyze the data and provide relevant, high-value suggestions. If no clear opportunities exist, return an empty array.
    `;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: 'You are an expert insurance sales and risk advisor.',
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                suggestionText: { type: Type.STRING },
                promptToInject: { type: Type.STRING },
              },
              required: ["title", "suggestionText", "promptToInject"],
            }
          }
        }
      });
      const jsonText = response.text.trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error("Error generating opportunities:", error);
      return [];
    }
  };
  
  export const generateRateChangeExplanation = async (previousPremium: string, newPremium: string): Promise<string> => {
      const prompt = `
          A client's insurance premium has increased from ${previousPremium} to ${newPremium}.
          Generate a brief (2-3 sentences), empathetic, and professional explanation for this common situation.
          The goal is to proactively address the client's likely question ("Why did my rate go up?") in a way that builds trust.
          
          **Key things to include:**
          - Acknowledge that rate changes can be frustrating.
          - Mention general, industry-wide factors, NOT specific-to-the-client reasons. Good examples: "rising costs of repairs and materials," "an increase in severe weather events in our region," or "general inflation."
          - Do NOT admit fault, guarantee rates, or speculate on the client's specific risk profile.
          - Reassure them that their new rate reflects the current cost to protect their property adequately.
          - End by inviting them to call if they'd like to discuss it further.
          
          Generate only the text paragraph.
      `;
      try {
          const response = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                  systemInstruction: 'You are a helpful, empathetic, and experienced insurance agent explaining a rate change to a valued client.'
              }
          });
          return response.text;
      } catch (error) {
          console.error("Error generating rate change explanation:", error);
          return "We understand that seeing a premium increase can be frustrating. Rates across the industry are being adjusted to account for factors like the rising costs of labor and materials for repairs. We've ensured your policy continues to provide the best protection for your investment. Please feel free to call us if you'd like to review your coverage options.";
      }
  };

export const generateSmsText = async (idea: string, agentName: string = 'Bill Layne Insurance'): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model,
            contents: `
                Generate a friendly, professional SMS text message based on this idea:

                "${idea}"

                Requirements:
                - Keep it concise and suitable for SMS (160-300 characters ideal)
                - Include relevant emojis to make it engaging
                - Professional but warm tone
                - Sign off from: ${agentName}
                - Make it sound natural and conversational
                - Perfect grammar and spelling
            `,
            config: {
                systemInstruction: `You are an expert at writing engaging, professional SMS text messages for an insurance agency.
                Create messages that are friendly, clear, and include appropriate emojis.
                Keep the tone warm and professional.`
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating SMS text:", error);
        return "Hi! Thanks for being a valued customer. Please reach out if you need anything. 😊";
    }
};