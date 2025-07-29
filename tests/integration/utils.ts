

export function generateRandomHostNamespace() {
    return `host-${Math.random().toString(36).substring(2, 15)}`;
}

export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}