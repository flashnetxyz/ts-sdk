

export function generateRandomHostNamespace() {
    return `host-${Math.random().toString(36).substring(2, 15)}`;
}