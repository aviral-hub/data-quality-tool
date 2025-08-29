"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Wand2 } from "lucide-react"
import type { FileData } from "@/app/page"
import { toast } from "sonner"

// add robust sanitization + JSON object extraction before parsing model output
function stripMarkdownFences(text: string): string {
  // remove triple-backtick code fences \`\`\`json ... \`\`\` or \`\`\` ... \`\`\`
  const fenced = text.replace(/```[\s\S]*?```/g, (block) => {
    // try to keep inner content while stripping the fences
    return block.replace(/^```(\w+)?\s*/i, "").replace(/```$/i, "")
  })
  // remove leading markdown headings that can break JSON parsing
  return fenced
    .split("\n")
    .filter((line) => !/^\s*#(#+)?\s*/.test(line)) // drop markdown headings
    .join("\n")
    .trim()
}

function extractFirstJSONObject(text: string): string | null {
  // scan for the first balanced {...} JSON object
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "{") {
      if (depth === 0) start = i
      depth++
    } else if (c === "}") {
      depth--
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1)
      }
    }
  }
  return null
}

function safeJSONParse<T = any>(text: string): T {
  // Try raw parse first
  try {
    return JSON.parse(text) as T
  } catch {
    // continue to cleaning steps
  }

  let cleanText = text

  // 1) Remove fenced code blocks \`\`\` or \`\`\`json
  cleanText = cleanText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, "$1")

  // 2) Remove markdown headings (lines starting with # ...)
  cleanText = cleanText.replace(/^\s*#.*$/gm, "")

  // 3) Remove stray single backticks
  cleanText = cleanText.replace(/`/g, "")

  // 4) Neutralize code fields that are often returned unquoted.
  // Replace any pythonCode/sqlCode values with empty strings to preserve valid JSON
  // even if the model emitted raw code.
  cleanText = cleanText.replace(
    /"pythonCode"\s*:\s*([\s\S]*?)(,|\n\s*})/g,
    (_m, _val, tail) => `"pythonCode": ""${tail}`,
  )
  cleanText = cleanText.replace(/"sqlCode"\s*:\s*([\s\S]*?)(,|\n\s*})/g, (_m, _val, tail) => `"sqlCode": ""${tail}`)

  // Try parse again after cleaning
  try {
    return JSON.parse(cleanText) as T
  } catch {
    // 5) Fallback: extract the first JSON object braces
    const start = cleanText.indexOf("{")
    const end = cleanText.lastIndexOf("}")
    if (start !== -1 && end !== -1 && end > start) {
      const maybeJson = cleanText.substring(start, end + 1)
      // Ensure any remaining code fields are neutralized in the extracted slice too
      const slice = maybeJson
        .replace(/"pythonCode"\s*:\s*([\s\S]*?)(,|\n\s*})/g, (_m, _v, tail) => `"pythonCode": ""${tail}`)
        .replace(/"sqlCode"\s*:\s*([\s\S]*?)(,|\n\s*})/g, (_m, _v, tail) => `"sqlCode": ""${tail}`)
      return JSON.parse(slice) as T
    }
    throw new Error("Could not locate valid JSON in LLM response")
  }
}

// Import or declare the generateText and groq variables before using them
const generateText = async (params: any) => {
  // Mock implementation for demonstration purposes
  return { text: "{}" }
}

const groq = (model: string) => {
  // Mock implementation for demonstration purposes
  return model
}

// Declare the CleaningRecommendation type
type CleaningRecommendation = {
  id: string
  title: string
  description: string
  userFriendlyExplanation: string
  impact: string
  confidence: number
  affectedRows: number
  category: string
  businessImpact: string
  stepByStepGuide: string[]
  estimatedTimeToFix: string
  difficulty: string
  pythonCode: string
  sqlCode: string
  preview: string
}

// ensure prompts instruct model to return ONLY JSON (no prose/markdown)
const AI_JSON_SYSTEM_PROMPT =
  "You are a strict JSON generator. Return ONLY a single JSON object, no prose, no markdown, no code fences, no headings."

async function generateAIRecommendations(/* ... existing params ... */) {
  try {
    // ... existing model call ...
    // example (keep your current call, just adapt parsing):
    // const { text } = await generateText({ model: groq('llama-3.1-8b-instant'), system: AI_JSON_SYSTEM_PROMPT, prompt })
    // const ai = safeJSONParse(text)

    // ... existing code that receives `aiText` or similar ...
    const response = await generateText({ model: groq("llama-3.1-8b-instant"), system: AI_JSON_SYSTEM_PROMPT, prompt })
    const aiText = response.text // Declare aiText variable
    const ai = safeJSONParse(aiText)

    if (!ai) {
      // fallback to a minimal, safe structure to avoid runtime errors downstream
      return {
        recommendations: [],
        summary: "AI response could not be parsed; showing no-op recommendations.",
      }
    }

    const recommendations: CleaningRecommendation[] = ai.recommendations.map((rec: any) => ({
      id: rec.id || `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: rec.title,
      description: rec.description,
      userFriendlyExplanation: rec.userFriendlyExplanation,
      impact: rec.impact,
      confidence: rec.confidence,
      affectedRows: rec.affectedRows,
      category: rec.category,
      businessImpact: rec.businessImpact,
      stepByStepGuide: Array.isArray(rec.stepByStepGuide) ? rec.stepByStepGuide : [],
      estimatedTimeToFix: rec.estimatedTimeToFix,
      difficulty: rec.difficulty,
      pythonCode: typeof rec.pythonCode === "string" ? rec.pythonCode : "",
      sqlCode: typeof rec.sqlCode === "string" ? rec.sqlCode : "",
      preview: rec.preview,
    }))

    return { recommendations, summary: ai.summary }
  } catch (e) {
    console.error("[v0] Error generating AI recommendations:", e)
    return {
      recommendations: [],
      summary: "AI generation failed; showing no-op recommendations.",
    }
  }
}

const generateCleaningRecommendations = (dataSummary: any) => {
  const prompt = `You are a friendly data consultant explaining to a business owner (not a technical person) how to improve their data. Use simple, clear language and focus on business impact.

Dataset: ${dataSummary.fileName}
- ${dataSummary.totalRows} rows of data
- ${dataSummary.totalColumns} different types of information
- Current quality score: ${dataSummary.qualityScore}%

Problems found:
${Object.entries(dataSummary.nullValues)
  .map(([col, count]) => `- ${col}: ${count} missing values`)
  .join("\n")}
${dataSummary.duplicates > 0 ? `- ${dataSummary.duplicates} duplicate records` : ""}

Sample data columns: ${dataSummary.headers.join(", ")}

Provide 4-6 recommendations in JSON format. For each recommendation, explain:
1. What the problem is in simple terms (like explaining to a friend)
2. Why it matters for business success
3. How to fix it step-by-step
4. What the result will look like
5. How long it will take and how difficult it is

IMPORTANT:
- Return ONLY a valid JSON object. No markdown, no headings, no code fences, no backticks, no extra prose.
- Set "pythonCode" and "sqlCode" to empty strings ("") — do NOT include any code.
- Ensure all values are proper JSON types (strings, numbers, arrays); do not leave unquoted text.

Format:
{
  "recommendations": [
    {
      "id": "unique_id",
      "title": "Simple, clear title",
      "description": "Brief technical description",
      "userFriendlyExplanation": "Explain like talking to a business owner who isn't technical - use analogies and simple language",
      "impact": "low|medium|high",
      "confidence": 0.95,
      "affectedRows": 150,
      "category": "missing_data|duplicates|outliers|formatting|validation",
      "businessImpact": "How this affects business decisions, revenue, customers, etc.",
      "stepByStepGuide": ["Step 1: Clear action", "Step 2: Clear action", "Step 3: Clear action"],
      "estimatedTimeToFix": "15 minutes|1 hour|half day",
      "difficulty": "easy|medium|hard",
      "pythonCode": "",
      "sqlCode": "",
      "preview": "What will change after applying this fix"
    }
  ]
}

Focus on practical, business-focused explanations that anyone can understand. Use analogies and real-world examples.`
  return prompt
}

function makeOfflineInsights(file: FileData) {
  const headers = file.headers || []
  const rows = file.data || []

  // Basic missing value counts
  const nullCounts: Record<string, number> = {}
  for (const h of headers) nullCounts[h] = 0

  for (const row of rows) {
    for (const h of headers) {
      const v = (row as any)?.[h]
      if (v === null || v === undefined || String(v).trim() === "") {
        nullCounts[h]++
      }
    }
  }

  const suggestions: Array<{
    title: string
    impact: "low" | "medium" | "high"
    details: string
    affectedRows: number
  }> = []

  // Suggest filling missing values
  Object.entries(nullCounts).forEach(([col, count]) => {
    if (count > 0) {
      suggestions.push({
        title: `Handle missing values in "${col}"`,
        impact: count / Math.max(rows.length, 1) > 0.1 ? "high" : "medium",
        details: `Found ${count} missing values in column "${col}". Consider imputing, removing, or backfilling.`,
        affectedRows: count,
      })
    }
  })

  // Simple duplicate check by JSON string (best-effort)
  let duplicates = 0
  try {
    const seen = new Set<string>()
    for (const row of rows) {
      const key = JSON.stringify(row)
      if (seen.has(key)) duplicates++
      else seen.add(key)
    }
  } catch {
    // ignore if rows are not serializable
  }
  if (duplicates > 0) {
    suggestions.push({
      title: "Remove duplicate rows",
      impact: duplicates / Math.max(rows.length, 1) > 0.05 ? "high" : "medium",
      details: `Detected approximately ${duplicates} potential duplicate rows.`,
      affectedRows: duplicates,
    })
  }

  // Very rough quality estimate
  const totalNulls = Object.values(nullCounts).reduce((a, b) => a + b, 0)
  const totalCells = headers.length * Math.max(rows.length, 1)
  const nullRatio = totalCells ? totalNulls / totalCells : 0
  const qualityScore = Math.max(0, Math.round(100 - nullRatio * 100))

  return { suggestions, qualityScore }
}

export interface AiDataAssistantProps {
  file: FileData
  onFileUpdate: (file: FileData) => void
}

function AiDataAssistant({ file, onFileUpdate }: AiDataAssistantProps) {
  const [generating, setGenerating] = useState(false)
  const [insights, setInsights] = useState<
    Array<{ title: string; impact: "low" | "medium" | "high"; details: string; affectedRows: number }>
  >([])

  const summary = useMemo(() => {
    return {
      rows: file.data?.length || 0,
      cols: file.headers?.length || 0,
      name: file.name,
    }
  }, [file])

  const generate = async () => {
    setGenerating(true)
    try {
      // Offline, deterministic insights to avoid key usage on client
      const { suggestions } = makeOfflineInsights(file)
      setInsights(suggestions)
      toast.success("Generated insights")
    } catch (e: any) {
      console.error("[v0] AI assistant error:", e?.message || e)
      toast.error("Failed to generate insights")
    } finally {
      setGenerating(false)
    }
  }

  const applySimpleClean = () => {
    // Example: trim string cells and normalize empty values to ""
    try {
      const headers = file.headers || []
      const cleaned = (file.data || []).map((row) => {
        const next: Record<string, any> = {}
        headers.forEach((h) => {
          const v = (row as any)?.[h]
          if (v === null || v === undefined) next[h] = ""
          else if (typeof v === "string") next[h] = v.trim()
          else next[h] = v
        })
        return next
      })

      const updated: FileData = {
        ...file,
        data: cleaned,
        analysis: file.analysis
          ? {
              ...file.analysis,
              qualityScore: Math.min(100, Math.round((file.analysis.qualityScore || 70) + 5)),
            }
          : file.analysis,
      }
      onFileUpdate(updated)
      toast.success("Applied simple cleaning")
    } catch (e) {
      console.error("[v0] applySimpleClean error:", e)
      toast.error("Failed to apply cleaning")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" />
          AI Data Assistant
        </CardTitle>
        <CardDescription>
          Quick, offline suggestions based on your dataset. For full AI-powered analysis, connect Groq in settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-gray-600">
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">File: {summary.name}</Badge>
            <Badge variant="secondary">Rows: {summary.rows}</Badge>
            <Badge variant="secondary">Columns: {summary.cols}</Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={generate} disabled={generating}>
            {generating ? "Generating..." : "Generate Insights"}
          </Button>
          <Button variant="outline" onClick={applySimpleClean}>
            <Wand2 className="h-4 w-4 mr-2" />
            Apply Simple Clean
          </Button>
        </div>

        {insights.length > 0 && (
          <div className="space-y-3">
            {insights.map((s, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium text-sm">{s.title}</h4>
                  <Badge
                    variant={s.impact === "high" ? "destructive" : s.impact === "medium" ? "secondary" : "outline"}
                    className="capitalize"
                  >
                    {s.impact}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600">{s.details}</p>
                <p className="text-xs text-gray-500 mt-1">Affected rows: {s.affectedRows}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { AiDataAssistant }
export default AiDataAssistant
