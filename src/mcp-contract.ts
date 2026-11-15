import { z } from "zod";
import { inspectRepository } from "./core.js";

export const reviewRepositoryInputSchema = {
  repo_path: z.string().min(1).describe("Repository path to inspect."),
  baseRef: z.string().optional(),
};

export async function handleReviewRepository(
  input: z.infer<z.ZodObject<typeof reviewRepositoryInputSchema>>,
) {
  const report = inspectRepository({
    repositoryPath: input.repo_path,
    baseRef: input.baseRef,
  });
  return { content: [{ type: "text" as const, text: report }] };
}
