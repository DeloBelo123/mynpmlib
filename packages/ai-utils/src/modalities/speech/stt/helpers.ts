import { promises as fs } from "fs"

export type STTAudioInput = string | Buffer | Uint8Array

function isLikelyPath(value: string): boolean {
    return !value.startsWith("data:") && !/^[A-Za-z0-9+/=]+$/.test(value)
}

export async function toBase64Audio(audio: STTAudioInput): Promise<string> {
    if (typeof audio === "string") {
        if (audio.startsWith("data:")) {
            const splitIndex = audio.indexOf("base64,")
            if (splitIndex === -1) {
                throw new Error("Invalid data URL audio input")
            }
            return audio.slice(splitIndex + "base64,".length)
        }

        if (isLikelyPath(audio)) {
            const fileBuffer = await fs.readFile(audio)
            return fileBuffer.toString("base64")
        }

        return audio
    }

    if (Buffer.isBuffer(audio)) {
        return audio.toString("base64")
    }

    if (audio instanceof Uint8Array) {
        return Buffer.from(audio).toString("base64")
    }

    throw new Error("Unsupported audio input type")
}

