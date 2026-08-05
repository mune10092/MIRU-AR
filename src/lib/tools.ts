import { tools, type Tool } from "@/data/tools";

export function getTools(): Tool[] {
  return tools;
}

export function getToolById(id: string): Tool | undefined {
  return tools.find((tool) => tool.id === id);
}
