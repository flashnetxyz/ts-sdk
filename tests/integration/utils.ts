

export function generateRandomHostNamespace() {
    return `host-${Math.random().toString(36).substring(2, 15)}`;
}

export function testLogging(message: string, context: string | string[], logLevel: "info" | "warn" | "error" = "info") {
    let logBeginning = "";
    if (Array.isArray(context)) {
        logBeginning = context.map(c => `[${c}]`).join(" ");
    } else {
        logBeginning = `[${context}]`;
    }
    switch (logLevel) {
        case "info":
            console.log(`${logBeginning} ${message}`);
            break;
        case "warn":
            console.warn(`${logBeginning} ${message}`);
            break;
        case "error":
    }
}