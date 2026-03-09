export interface AIErrorResponse {
  error: {
    code: number;
    message: string;
    status?: string;
    details?: unknown[];
  };
}

export function formatAIError(error: unknown): { title: string; message: string; isQuota: boolean; icon: "error" | "warning" | "info" } {
  const defaultTitle = "AI Generation Failed";
  const errorObj = (error && typeof error === 'object') ? (error as Record<string, unknown>) : null;
  const defaultMessage = typeof error === 'string' ? error : (String(errorObj?.message || error) || "An unexpected error occurred during AI generation.");
  const defaultIcon = "error";

  // Try to parse JSON error (like Gemini 429)
  let parsed: AIErrorResponse | null = null;
  try {
    if (errorObj && typeof errorObj.message === 'string' && errorObj.message.includes('{')) {
      const jsonStr = errorObj.message.substring(errorObj.message.indexOf('{'));
      parsed = JSON.parse(jsonStr);
    } else if (errorObj && typeof errorObj.description === 'string' && errorObj.description.includes('{')) {
      const jsonStr = errorObj.description.substring(errorObj.description.indexOf('{'));
      parsed = JSON.parse(jsonStr);
    }
  } catch {
    // Not JSON or parse failed
  }

  if (parsed?.error) {
    const { code, message, status } = parsed.error;

    if (code === 429 || status === "RESOURCE_EXHAUSTED") {
      let cleanMessage = "You have exceeded your current AI quota.";

      // Extract "Please retry in X seconds" if present
      const retryMatch = message.match(/Please retry in ([0-9.]+)s/);
      if (retryMatch) {
        cleanMessage += ` Please try again in ${Math.ceil(parseFloat(retryMatch[1]))} seconds.`;
      } else {
        cleanMessage += " Please check your plan or wait a few minutes before trying again.";
      }

      return {
        title: "Quota Exceeded",
        message: cleanMessage,
        isQuota: true,
        icon: "warning"
      };
    }

    return {
      title: `AI Error (${code})`,
      message: message,
      isQuota: false,
      icon: "error"
    };
  }

  // Handle local rate limits (defined in aiService.ts)
  if (defaultMessage.includes("Rate limit") || defaultMessage.includes("Daily limit")) {
    return {
      title: "Limit Reached",
      message: defaultMessage,
      isQuota: true,
      icon: "warning"
    };
  }

  return {
    title: defaultTitle,
    message: defaultMessage,
    isQuota: false,
    icon: defaultIcon
  };
}
