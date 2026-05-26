import type { ScannedSymbol } from "../scanner/types.js";

export interface ParserAdapterResult {
  symbols: ScannedSymbol[];
}

export interface ParserAdapter {
  language: string;
  parse(filePath: string, content: string): ParserAdapterResult;
}
