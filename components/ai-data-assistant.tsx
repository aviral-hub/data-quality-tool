"use client"

import { useState, useEffect, useCallback } from "react"
import type { FileData } from "@/app/page"
import { groq } from "@ai-sdk/groq"
import { generateText } from "ai"
import { toast } from "sonner"

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

import {
  Brain,
  Wand2,
  Download,
  Wifi,
  WifiOff,
  Lightbulb,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  Info,
} from "lucide-react"

/**
 * Attempt to parse text as JSON.
 * If the text contains extra prose, grab the first {...} block.
 */
function safeJSONParse<T = any>(text: string): T {
  try {
    // First try the whole string
    return JSON.parse(text) as T
  } catch {
    // Fallback: extract the first {...} pair
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end !== -1 && end > start) {
      const maybeJson = text.substring(start, end + 1)
      return JSON.parse(maybeJson) as T
    }
    // Still no luck – rethrow to trigger local-knowledge fallback
    throw new Error("Could not locate valid JSON in LLM response")
  }
}

/**
 * Props for the AiDataAssistant component
 */
interface AiDataAssistantProps {
  file: FileData
  onFileUpdate: (file: FileData) => void
}

/**
 * Structure for AI-generated cleaning recommendations
 */
interface CleaningRecommendation {
  id: string
  title: string
  description: string
  userFriendlyExplanation: string
  impact: "low" | "medium" | "high"
  confidence: number
  affectedRows: number
  code: {
    python: string
    sql: string
  }
  preview: string
  category: "missing_data" | "duplicates" | "outliers" | "formatting" | "validation"
  businessImpact: string
  stepByStepGuide: string[]
  estimatedTimeToFix: string
  difficulty: "easy" | "medium" | "hard"
}

/**
 * Structure for AI business insights
 */
interface BusinessInsight {
  id: string
  title: string
  description: string
  userFriendlyExplanation: string
  impact: string
  recommendation: string
  priority: "low" | "medium" | "high" | "critical"
  metrics?: {
    before: number
    after: number
    improvement: number
  }
  actionItems: string[]
  timeline: string
  costBenefit: string
}

/**
 * Comprehensive Local Knowledge Base for offline functionality
 */
const LOCAL_KNOWLEDGE_BASE = {
  dataQualityRules: {
    missing_data: {
      title: "Missing Data",
      explanation:
        "Missing data means some cells in your spreadsheet are empty or contain no information. Think of it like having blank spaces in a form - you can't make complete decisions without all the information.",
      businessImpact:
        "Missing data can lead to incomplete analysis and wrong business decisions. For example, if customer ages are missing, you can't properly target marketing campaigns.",
      commonCauses: [
        "People skipped fields when filling out forms",
        "Computer systems had errors during data collection",
        "Optional fields that users didn't complete",
        "Problems when combining data from different sources",
        "Equipment failures or network issues during data transfer",
      ],
      solutions: [
        "Fill with average values for numbers (like using average age if someone's age is missing)",
        "Use 'Unknown' or 'Not Specified' for text fields",
        "Remove entire rows if too much information is missing",
        "Go back to original sources to collect missing information",
        "Use statistical methods to predict missing values based on other data",
      ],
      preventionTips: [
        "Make important fields required in online forms",
        "Add validation rules that check data as it's entered",
        "Train staff on proper data entry procedures",
        "Set up regular automated data quality checks",
        "Create backup systems for data collection",
      ],
    },
    duplicates: {
      title: "Duplicate Records",
      explanation:
        "Duplicate records are like having the same person's information written down twice in your address book. They're identical or very similar rows that appear multiple times in your data.",
      businessImpact:
        "Duplicates can inflate your numbers, making you think you have more customers than you actually do. They also waste storage space and can cause confusion in reports.",
      commonCauses: [
        "The same information was entered multiple times by mistake",
        "Computer glitches during data import created copies",
        "Data from different sources was merged without checking for duplicates",
        "No unique ID numbers to identify each record",
        "Multiple people entering the same customer information",
      ],
      solutions: [
        "Remove exact duplicates automatically (keep one copy, delete the rest)",
        "Merge similar records that have slight differences (like 'John Smith' and 'J. Smith')",
        "Keep the most recent or most complete version of duplicate records",
        "Create unique ID numbers for each record to prevent future duplicates",
        "Use 'fuzzy matching' to find records that are almost identical",
      ],
      preventionTips: [
        "Use unique ID numbers (like customer IDs) for each record",
        "Set up duplicate checking before saving new records",
        "Schedule regular database cleanup and maintenance",
        "Train staff on proper data entry procedures",
        "Implement 'merge' features instead of creating new records",
      ],
    },
    formatting: {
      title: "Inconsistent Formatting",
      explanation:
        "Formatting issues are like having some addresses written as '123 Main St' and others as '123 MAIN STREET' - the same information written in different ways, making it hard to work with.",
      businessImpact:
        "Poor formatting makes data hard to analyze and can cause errors in reports. It's like trying to organize a filing cabinet where everyone uses different filing systems.",
      commonCauses: [
        "Different people entering data in their own style",
        "Importing data from various sources with different formats",
        "No standardized guidelines for data entry",
        "Manual data entry without format validation",
        "Legacy systems with different formatting rules",
      ],
      solutions: [
        "Standardize date formats (always use MM/DD/YYYY or DD/MM/YYYY)",
        "Make text case consistent (Title Case, UPPERCASE, or lowercase)",
        "Remove extra spaces and special characters",
        "Use standard abbreviations and codes consistently",
        "Convert all similar data to the same format",
      ],
      preventionTips: [
        "Create clear data entry guidelines and share them with your team",
        "Use dropdown menus instead of free text when possible",
        "Implement format validation rules in data entry systems",
        "Provide regular training on data quality standards",
        "Use templates and standardized forms for data collection",
      ],
    },
  },

  faqResponses: {
    what_is_data_quality:
      "Data quality is like the cleanliness and organization of your workspace. Just as a clean, organized desk helps you work more efficiently and find things quickly, high-quality data helps you make better business decisions and get accurate insights. It means your data is accurate (correct), complete (not missing important information), consistent (formatted the same way), and up-to-date (current and relevant).",

    why_does_data_quality_matter:
      "Data quality directly impacts your business success. Poor quality data leads to wrong decisions, wasted money, missed opportunities, and lost customers. For example, if customer addresses are wrong, you can't deliver products. If sales data has errors, you might make poor inventory decisions. Good data quality gives you confidence in your analysis and helps you make smart business choices.",

    how_long_does_cleaning_take:
      "Data cleaning time depends on your data size and quality. For small datasets (under 1,000 rows), basic cleaning might take 30 minutes to 2 hours. Larger datasets or those with many issues could take several days. However, the time invested in cleaning pays off through better decision-making and fewer problems later.",

    what_should_i_fix_first:
      "Start with issues that have the biggest business impact: 1) Missing critical information (like customer contact details), 2) Obvious errors (like negative prices or future birth dates), 3) Duplicates that inflate your numbers, 4) Formatting issues that prevent analysis. Focus on data you use most frequently for important decisions.",
  },
}

/**
 * AI Data Assistant Component with Groq AI Integration
 */
export function AiDataAssistant({ file, onFileUpdate }: AiDataAssistantProps) {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [cleaningRecommendations, setCleaningRecommendations] = useState<CleaningRecommendation[]>([])
  const [businessInsights, setBusinessInsights] = useState<BusinessInsight[]>([])
  const [selectedRecommendations, setSelectedRecommendations] = useState<Set<string>>(new Set())
  const [customPrompt, setCustomPrompt] = useState("")
  const [customAnalysis, setCustomAnalysis] = useState("")
  const [isCustomAnalyzing, setIsCustomAnalyzing] = useState(false)
  const [activeTab, setActiveTab] = useState("recommendations")
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [useLocalKnowledge, setUseLocalKnowledge] = useState(false)

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  // ============================================================================
  // LOCAL KNOWLEDGE BASE FUNCTIONS
  // ============================================================================

  /**
   * Generate recommendations using local knowledge base
   */
  const generateLocalRecommendations = useCallback((dataSummary: any): CleaningRecommendation[] => {
    const recommendations: CleaningRecommendation[] = []

    // Check for missing data
    const totalNulls = Object.values(dataSummary.nullValues).reduce((sum: number, count: any) => sum + count, 0)
    if (totalNulls > 0) {
      const knowledge = LOCAL_KNOWLEDGE_BASE.dataQualityRules.missing_data
      const nullPercentage = Math.round((totalNulls / (dataSummary.totalRows * dataSummary.totalColumns)) * 100)

      recommendations.push({
        id: "local_missing_data",
        title: "Fix Missing Information",
        description: "Your data has empty cells that need attention.",
        userFriendlyExplanation: `${knowledge.explanation} In your file, ${totalNulls} cells are empty (${nullPercentage}% of your data). This is like having ${nullPercentage}% of a puzzle missing - you can't see the complete picture.`,
        impact:
          totalNulls > dataSummary.totalRows * 0.1
            ? "high"
            : totalNulls > dataSummary.totalRows * 0.05
              ? "medium"
              : "low",
        confidence: 0.95,
        affectedRows: totalNulls,
        category: "missing_data",
        businessImpact: knowledge.businessImpact,
        stepByStepGuide: [
          "1. Look at which columns have the most missing data - these are your priorities",
          "2. Decide for each column: Should you fill the blanks or remove incomplete rows?",
          "3. For number columns (like age, price), consider using the average value",
          "4. For text columns (like names, categories), use 'Unknown' or 'Not Specified'",
          "5. For critical business data, try to collect the missing information from original sources",
          "6. Document your decisions so your team knows what you did and why",
        ],
        estimatedTimeToFix: totalNulls < 100 ? "15-30 minutes" : totalNulls < 1000 ? "1-2 hours" : "Half day",
        difficulty: "easy",
        code: {
          python: `# Fill missing values with appropriate defaults
import pandas as pd

# For numeric columns, fill with median (middle value)
numeric_columns = df.select_dtypes(include=['number']).columns
df[numeric_columns] = df[numeric_columns].fillna(df[numeric_columns].median())

# For text columns, fill with 'Unknown'
text_columns = df.select_dtypes(include=['object']).columns
df[text_columns] = df[text_columns].fillna('Unknown')

print(f"Filled {totalNulls} missing values")`,
          sql: `-- Fill missing numeric values with median
UPDATE your_table 
SET numeric_column = (
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY numeric_column) 
  FROM your_table 
  WHERE numeric_column IS NOT NULL
)
WHERE numeric_column IS NULL;

-- Fill missing text values
UPDATE your_table 
SET text_column = 'Unknown' 
WHERE text_column IS NULL OR text_column = '';`,
        },
        preview: `Will fill ${totalNulls} empty cells with appropriate default values, making your data complete and ready for analysis`,
      })
    }

    // Check for duplicates
    if (dataSummary.duplicates > 0) {
      const knowledge = LOCAL_KNOWLEDGE_BASE.dataQualityRules.duplicates
      const duplicatePercentage = Math.round((dataSummary.duplicates / dataSummary.totalRows) * 100)

      recommendations.push({
        id: "local_duplicates",
        title: "Remove Duplicate Records",
        description: "Your data contains identical or very similar records.",
        userFriendlyExplanation: `${knowledge.explanation} Your file has ${dataSummary.duplicates} duplicate records (${duplicatePercentage}% of your data). This is like having ${duplicatePercentage}% of your customer list repeated - it makes your numbers look bigger than they really are.`,
        impact: dataSummary.duplicates > dataSummary.totalRows * 0.05 ? "high" : "medium",
        confidence: 0.9,
        affectedRows: dataSummary.duplicates,
        category: "duplicates",
        businessImpact: knowledge.businessImpact,
        stepByStepGuide: [
          "1. First, make a backup copy of your data - always do this before removing anything",
          "2. Look at a few duplicate records to understand if they're truly identical",
          "3. Decide which version to keep: usually the most recent or most complete one",
          "4. Remove the duplicate copies, keeping only one version of each record",
          "5. Check your results to make sure you didn't accidentally remove important data",
          "6. Set up processes to prevent duplicates in the future",
        ],
        estimatedTimeToFix:
          dataSummary.duplicates < 50 ? "10-20 minutes" : dataSummary.duplicates < 500 ? "30-60 minutes" : "2-3 hours",
        difficulty: "medium",
        code: {
          python: `# Remove duplicate rows safely
import pandas as pd

# Show duplicates before removing them
print(f"Found {df.duplicated().sum()} duplicate rows")
print("Sample duplicates:")
print(df[df.duplicated()].head())

# Remove exact duplicates, keeping the first occurrence
df_cleaned = df.drop_duplicates()

print(f"Removed {len(df) - len(df_cleaned)} duplicate rows")
print(f"Your data now has {len(df_cleaned)} unique records")`,
          sql: `-- Safely remove duplicates using ROW_NUMBER()
WITH numbered_rows AS (
  SELECT *, 
    ROW_NUMBER() OVER (
      PARTITION BY column1, column2, column3 
      ORDER BY date_column DESC
    ) as row_num
  FROM your_table
)
-- First, see what will be deleted
SELECT COUNT(*) as duplicates_to_remove
FROM numbered_rows 
WHERE row_num > 1;

-- Then delete the duplicates
DELETE FROM your_table 
WHERE id IN (
  SELECT id FROM numbered_rows WHERE row_num > 1
);`,
        },
        preview: `Will remove ${dataSummary.duplicates} duplicate records, giving you accurate counts and cleaner data`,
      })
    }

    return recommendations
  }, [])

  /**
   * Generate business insights using local knowledge
   */
  const generateLocalInsights = useCallback((dataSummary: any): BusinessInsight[] => {
    const insights: BusinessInsight[] = []

    // Data quality insight
    const qualityScore = dataSummary.qualityScore || 0
    let qualityLevel = "Poor"
    let priority: "low" | "medium" | "high" | "critical" = "critical"

    if (qualityScore >= 90) {
      qualityLevel = "Excellent"
      priority = "low"
    } else if (qualityScore >= 70) {
      qualityLevel = "Good"
      priority = "medium"
    } else if (qualityScore >= 50) {
      qualityLevel = "Fair"
      priority = "high"
    }

    insights.push({
      id: "local_quality_insight",
      title: `Data Quality Assessment: ${qualityLevel} (${qualityScore}%)`,
      description: `Your overall data quality score is ${qualityScore}%, indicating ${qualityLevel.toLowerCase()} data quality.`,
      userFriendlyExplanation: `Think of data quality like your credit score - it tells you how trustworthy your data is for making important decisions. A score of ${qualityScore}% means your data is ${qualityLevel.toLowerCase()}. ${qualityScore >= 70 ? "This gives you good confidence in making business decisions based on your data." : "This means you should be cautious about making important decisions based on this data until you improve its quality."}`,
      impact:
        qualityScore >= 70
          ? "Your analysis and reports should be reliable, giving you confidence in business decisions"
          : "Poor data quality increases the risk of wrong business decisions, wasted resources, and missed opportunities",
      recommendation:
        qualityScore >= 70
          ? "Maintain current data quality standards and continue monitoring"
          : "Immediate action needed to improve data quality before making important business decisions",
      priority,
      timeline: qualityScore >= 70 ? "Maintain current standards" : "Address within 1-2 weeks",
      costBenefit:
        qualityScore >= 70
          ? "Continue current practices to maintain competitive advantage"
          : "Essential investment to prevent costly mistakes",
      actionItems:
        qualityScore >= 70
          ? [
              "Continue regular data quality monitoring",
              "Document current best practices for your team",
              "Train new team members on your data standards",
            ]
          : [
              "Address missing data and duplicates immediately",
              "Implement data validation rules in your systems",
              "Create clear data entry guidelines for your team",
              "Schedule weekly data quality reviews until improvement",
            ],
    })

    return insights
  }, [])

  /**
   * Get contextual response from local knowledge base
   */
  const getLocalResponse = useCallback(
    (prompt: string): string => {
      const lowerPrompt = prompt.toLowerCase()

      // Check for FAQ matches
      for (const [key, response] of Object.entries(LOCAL_KNOWLEDGE_BASE.faqResponses)) {
        if (
          lowerPrompt.includes(key.replace(/_/g, " ")) ||
          (key === "what_is_data_quality" &&
            (lowerPrompt.includes("data quality") || lowerPrompt.includes("quality"))) ||
          (key === "why_does_data_quality_matter" && lowerPrompt.includes("why") && lowerPrompt.includes("matter")) ||
          (key === "how_long_does_cleaning_take" &&
            (lowerPrompt.includes("how long") || lowerPrompt.includes("time"))) ||
          (key === "what_should_i_fix_first" && (lowerPrompt.includes("first") || lowerPrompt.includes("priority")))
        ) {
          return response
        }
      }

      // Check for specific data quality issues
      if (lowerPrompt.includes("missing") || lowerPrompt.includes("null") || lowerPrompt.includes("empty")) {
        const knowledge = LOCAL_KNOWLEDGE_BASE.dataQualityRules.missing_data
        return `${knowledge.explanation}\n\nFor your dataset with ${file.data.length} rows:\n\n**Common causes:** ${knowledge.commonCauses.slice(0, 3).join(", ")}\n\n**Solutions:** ${knowledge.solutions.slice(0, 3).join(", ")}\n\n**Prevention:** ${knowledge.preventionTips.slice(0, 2).join(", ")}`
      }

      if (lowerPrompt.includes("duplicate") || lowerPrompt.includes("repeated")) {
        const knowledge = LOCAL_KNOWLEDGE_BASE.dataQualityRules.duplicates
        return `${knowledge.explanation}\n\n**Business Impact:** ${knowledge.businessImpact}\n\n**Solutions:** ${knowledge.solutions.slice(0, 3).join(", ")}\n\n**Prevention:** ${knowledge.preventionTips.slice(0, 2).join(", ")}`
      }

      if (lowerPrompt.includes("format") || lowerPrompt.includes("consistent") || lowerPrompt.includes("standard")) {
        const knowledge = LOCAL_KNOWLEDGE_BASE.dataQualityRules.formatting
        return `${knowledge.explanation}\n\n**Business Impact:** ${knowledge.businessImpact}\n\n**Solutions:** ${knowledge.solutions.slice(0, 3).join(", ")}`
      }

      // General response
      return `Based on your question about "${prompt}" and your dataset with ${file.data.length} rows and ${file.headers.length} columns:\n\nI recommend starting with a comprehensive data quality analysis to identify the most impactful issues. The most common problems are:\n\n1. **Missing Data** - Empty cells that prevent complete analysis\n2. **Duplicates** - Repeated records that inflate numbers\n3. **Formatting Issues** - Inconsistent data that's hard to work with\n4. **Invalid Data** - Information that doesn't make sense\n\nWould you like me to run a full analysis to provide specific recommendations for your data?`
    },
    [file],
  )

  // ============================================================================
  // AI ANALYSIS FUNCTIONS
  // ============================================================================

  /**
   * Generate comprehensive AI analysis of the dataset
   */
  const generateAiAnalysis = useCallback(async () => {
    if (isAnalyzing) return

    setIsAnalyzing(true)
    setAnalysisProgress(0)

    try {
      // Step 1: Prepare data summary for analysis
      setAnalysisProgress(20)

      const dataSummary = {
        fileName: file.name,
        totalRows: file.analysis?.totalRows || file.data.length,
        totalColumns: file.analysis?.totalColumns || file.headers.length,
        headers: file.headers,
        dataTypes: file.analysis?.dataTypes || {},
        nullValues: file.analysis?.nullValues || {},
        duplicates: file.analysis?.duplicates || 0,
        qualityScore: file.analysis?.qualityScore || 0,
        sampleData: file.data.slice(0, 5),
        contextualIssues: file.analysis?.contextualIssues?.slice(0, 10) || [],
        crossFieldIssues: file.analysis?.crossFieldIssues?.slice(0, 5) || [],
      }

      // Check if we should use local knowledge or AI
      if (!isOnline || useLocalKnowledge) {
        setAnalysisProgress(50)
        const localRecommendations = generateLocalRecommendations(dataSummary)
        setCleaningRecommendations(localRecommendations)

        setAnalysisProgress(80)
        const localInsights = generateLocalInsights(dataSummary)
        setBusinessInsights(localInsights)

        setAnalysisProgress(100)
        toast.success("Analysis completed using local knowledge base!")
      } else {
        // Use AI analysis
        setAnalysisProgress(40)
        await generateCleaningRecommendations(dataSummary)

        setAnalysisProgress(70)
        await generateBusinessInsights(dataSummary)

        setAnalysisProgress(100)
        toast.success("AI analysis completed successfully!")
      }
    } catch (error) {
      console.error("Error in analysis:", error)
      // Fallback to local knowledge
      const dataSummary = {
        fileName: file.name,
        totalRows: file.analysis?.totalRows || file.data.length,
        totalColumns: file.analysis?.totalColumns || file.headers.length,
        headers: file.headers,
        dataTypes: file.analysis?.dataTypes || {},
        nullValues: file.analysis?.nullValues || {},
        duplicates: file.analysis?.duplicates || 0,
        qualityScore: file.analysis?.qualityScore || 0,
        contextualIssues: file.analysis?.contextualIssues || [],
      }

      const localRecommendations = generateLocalRecommendations(dataSummary)
      setCleaningRecommendations(localRecommendations)

      const localInsights = generateLocalInsights(dataSummary)
      setBusinessInsights(localInsights)

      toast.info("Using local knowledge base due to connection issues")
    } finally {
      setIsAnalyzing(false)
      setAnalysisProgress(0)
    }
  }, [file, isAnalyzing, isOnline, useLocalKnowledge, generateLocalRecommendations, generateLocalInsights])

  /**
   * Generate AI-powered cleaning recommendations with user-friendly explanations
   */
  const generateCleaningRecommendations = useCallback(async (dataSummary: any) => {
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
      "pythonCode": "# Code with clear comments explaining what each line does",
      "sqlCode": "-- SQL with explanations",
      "preview": "What will change after applying this fix"
    }
  ]
}

Focus on practical, business-focused explanations that anyone can understand. Use analogies and real-world examples.`

    try {
      const { text } = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt,
        maxTokens: 3000,
      })

      const aiResponse = safeJSONParse<{ recommendations: any[] }>(text)
      if (!aiResponse?.recommendations?.length) {
        throw new Error("No recommendations field in AI response")
      }

      const recommendations: CleaningRecommendation[] = aiResponse.recommendations.map((rec: any) => ({
        id: rec.id || `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: rec.title,
        description: rec.description,
        userFriendlyExplanation: rec.userFriendlyExplanation,
        impact: rec.impact,
        confidence: rec.confidence,
        affectedRows: rec.affectedRows,
        category: rec.category,
        businessImpact: rec.businessImpact,
        stepByStepGuide: rec.stepByStepGuide || [],
        estimatedTimeToFix: rec.estimatedTimeToFix || "30 minutes",
        difficulty: rec.difficulty || "medium",
        code: {
          python: rec.pythonCode,
          sql: rec.sqlCode,
        },
        preview: rec.preview,
      }))

      setCleaningRecommendations(recommendations)
    } catch (error) {
      console.error("Error generating AI recommendations:", error)
      toast.error("AI response was not valid JSON – falling back to local knowledge")
      throw error
    }
  }, [])

  /**
   * Generate business insights with user-friendly explanations
   */
  const generateBusinessInsights = useCallback(async (dataSummary: any) => {
    const prompt = `You are a business consultant explaining data insights to a company owner. Use simple language and focus on business impact, not technical details.

Dataset: ${dataSummary.fileName}
- ${dataSummary.totalRows} records
- Quality score: ${dataSummary.qualityScore}%
- ${Object.values(dataSummary.nullValues).reduce((sum: number, count: any) => sum + count, 0)} missing values
- ${dataSummary.duplicates} duplicates

Provide 4-5 business insights in JSON format:
{
  "insights": [
    {
      "id": "unique_id",
      "title": "Business-focused insight title",
      "description": "Brief technical description",
      "userFriendlyExplanation": "Explain the business impact in simple terms with analogies",
      "impact": "How this affects the business (revenue, customers, operations, etc.)",
      "recommendation": "What the business should do about it",
      "priority": "low|medium|high|critical",
      "timeline": "When this should be addressed",
      "costBenefit": "Cost of fixing vs cost of not fixing",
      "actionItems": ["Specific action 1", "Specific action 2", "Specific action 3"],
      "metrics": {
        "before": 75,
        "after": 90,
        "improvement": 15
      }
    }
  ]
}

Focus on:
- Revenue impact and cost savings
- Customer satisfaction and retention
- Operational efficiency improvements
- Risk management and compliance
- Competitive advantages from better data`

    try {
      const { text } = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt,
        maxTokens: 2500,
      })

      const aiResponse = safeJSONParse<{ insights: any[] }>(text)
      if (!aiResponse?.insights?.length) {
        throw new Error("No insights field in AI response")
      }

      const insights: BusinessInsight[] = aiResponse.insights.map((insight: any) => ({
        id: insight.id || `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: insight.title,
        description: insight.description,
        userFriendlyExplanation: insight.userFriendlyExplanation,
        impact: insight.impact,
        recommendation: insight.recommendation,
        priority: insight.priority,
        timeline: insight.timeline || "Within 1 month",
        costBenefit: insight.costBenefit || "Investment in data quality pays off through better decisions",
        metrics: insight.metrics,
        actionItems: insight.actionItems || [],
      }))

      setBusinessInsights(insights)
    } catch (error) {
      console.error("Error generating business insights:", error)
      toast.error("AI response was not valid JSON – falling back to local knowledge")
      throw error
    }
  }, [])

  /**
   * Generate custom analysis based on user prompt
   */
  const generateCustomAnalysis = useCallback(async () => {
    if (!customPrompt.trim() || isCustomAnalyzing) return

    setIsCustomAnalyzing(true)

    try {
      if (!isOnline) {
        // Use local knowledge-based response
        const localResponse = getLocalResponse(customPrompt)
        setCustomAnalysis(localResponse)
        toast.success("Response generated using local knowledge!")
        return
      }

      const dataSummary = {
        fileName: file.name,
        totalRows: file.data.length,
        headers: file.headers,
        sampleData: file.data.slice(0, 3),
        qualityScore: file.analysis?.qualityScore || 0,
      }

      const prompt = `You are a friendly data consultant. A business owner asked: "${customPrompt}"

Their dataset:
- File: ${dataSummary.fileName}
- ${dataSummary.totalRows} rows
- Columns: ${dataSummary.headers.join(", ")}
- Quality Score: ${dataSummary.qualityScore}%

Provide a helpful, easy-to-understand response that:
1. Answers their question directly in simple terms
2. Explains any technical concepts using analogies and real-world examples
3. Gives practical, actionable advice they can implement
4. Includes specific examples relevant to their data when possible
5. Focuses on business impact and benefits
6. Uses encouraging, supportive language

Use friendly, conversational language as if you're talking to a colleague who trusts your expertise but isn't technical.`

      const { text } = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt,
        maxTokens: 1500,
      })

      setCustomAnalysis(text)
      toast.success("Custom analysis generated!")
    } catch (error) {
      console.error("Error generating custom analysis:", error)
      // Fallback to local knowledge
      const localResponse = getLocalResponse(customPrompt)
      setCustomAnalysis(localResponse)
      toast.info("Using local knowledge due to connection issues")
    } finally {
      setIsCustomAnalyzing(false)
    }
  }, [customPrompt, file, isCustomAnalyzing, isOnline, getLocalResponse])

  /**
   * Apply selected cleaning recommendations
   */
  const applySelectedRecommendations = useCallback(async () => {
    if (selectedRecommendations.size === 0) {
      toast.error("Please select recommendations to apply")
      return
    }

    try {
      let updatedData = [...file.data]
      let totalChanges = 0

      for (const recId of selectedRecommendations) {
        const recommendation = cleaningRecommendations.find((r) => r.id === recId)
        if (!recommendation) continue

        switch (recommendation.category) {
          case "missing_data":
            updatedData = updatedData.map((row) => {
              const newRow = { ...row }
              Object.keys(newRow).forEach((key) => {
                if (newRow[key] === null || newRow[key] === undefined || newRow[key] === "") {
                  const dataType = file.analysis?.dataTypes?.[key]
                  if (dataType === "number") {
                    newRow[key] = 0
                  } else if (dataType === "string") {
                    newRow[key] = "Unknown"
                  } else {
                    newRow[key] = ""
                  }
                  totalChanges++
                }
              })
              return newRow
            })
            break

          case "duplicates":
            const seen = new Set()
            const originalLength = updatedData.length
            updatedData = updatedData.filter((row) => {
              const rowString = JSON.stringify(row)
              if (seen.has(rowString)) {
                return false
              }
              seen.add(rowString)
              return true
            })
            totalChanges += originalLength - updatedData.length
            break

          case "formatting":
            updatedData = updatedData.map((row) => {
              const newRow = { ...row }
              Object.keys(newRow).forEach((key) => {
                if (typeof newRow[key] === "string") {
                  // Trim whitespace
                  newRow[key] = newRow[key].trim()

                  // Standardize case based on field type
                  if (key.toLowerCase().includes("email")) {
                    newRow[key] = newRow[key].toLowerCase()
                  } else if (key.toLowerCase().includes("name") || key.toLowerCase().includes("city")) {
                    newRow[key] = newRow[key].replace(
                      /\w\S*/g,
                      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
                    )
                  }

                  // Remove multiple spaces
                  newRow[key] = newRow[key].replace(/\s+/g, " ")
                  totalChanges++
                }
              })
              return newRow
            })
            break

          case "validation":
            updatedData = updatedData.map((row) => {
              const newRow = { ...row }
              Object.keys(newRow).forEach((key) => {
                // Fix common validation issues
                if (key.toLowerCase().includes("email") && typeof newRow[key] === "string") {
                  if (!newRow[key].includes("@")) {
                    newRow[key] = "invalid@example.com"
                    totalChanges++
                  }
                }
                if (key.toLowerCase().includes("phone") && typeof newRow[key] === "string") {
                  newRow[key] = newRow[key].replace(/[^0-9]/g, "")
                  totalChanges++
                }
                if (key.toLowerCase().includes("price") && typeof newRow[key] === "number") {
                  if (newRow[key] < 0) {
                    newRow[key] = Math.abs(newRow[key])
                    totalChanges++
                  }
                }
              })
              return newRow
            })
            break
        }
      }

      const updatedFile = {
        ...file,
        data: updatedData,
        efficiency: {
          ...file.efficiency!,
          fixesApplied: (file.efficiency?.fixesApplied || 0) + totalChanges,
          dataQualityImprovement: 20,
        },
      }

      onFileUpdate(updatedFile)
      setSelectedRecommendations(new Set())
      toast.success(`Applied ${selectedRecommendations.size} recommendations, made ${totalChanges} changes`)
    } catch (error) {
      console.error("Error applying recommendations:", error)
      toast.error("Failed to apply recommendations")
    }
  }, [selectedRecommendations, cleaningRecommendations, file, onFileUpdate])

  /**
   * Export analysis report
   */
  const exportAnalysisReport = useCallback(() => {
    try {
      const report = {
        metadata: {
          fileName: file.name,
          generatedAt: new Date().toISOString(),
          totalRows: file.data.length,
          totalColumns: file.headers.length,
          qualityScore: file.analysis?.qualityScore || 0,
          analysisMethod: isOnline && !useLocalKnowledge ? "AI-powered" : "Local knowledge base",
        },
        cleaningRecommendations,
        businessInsights,
        customAnalysis: customAnalysis || null,
        knowledgeBase: {
          dataQualityRules: LOCAL_KNOWLEDGE_BASE.dataQualityRules,
        },
      }

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${file.name.replace(/\.[^/.]+$/, "")}_ai_analysis.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success("Analysis report exported successfully!")
    } catch (error) {
      console.error("Error exporting report:", error)
      toast.error("Failed to export analysis report")
    }
  }, [file, cleaningRecommendations, businessInsights, customAnalysis, isOnline, useLocalKnowledge])

  // ============================================================================
  // COMPONENT RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-600" />
            AI Data Assistant
            {isOnline ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-orange-600" />}
          </h2>
          <p className="text-sm lg:text-base text-gray-600">
            Get intelligent insights and automated cleaning recommendations
          </p>

          {/* Status Alert */}
          <Alert className="mt-2">
            <Info className="h-4 w-4" />
            <AlertDescription>
              {isOnline
                ? useLocalKnowledge
                  ? "Using local knowledge base for faster, reliable recommendations"
                  : "Connected to AI service for advanced analysis"
                : "Offline mode: Using built-in knowledge base for reliable recommendations"}
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button onClick={generateAiAnalysis} disabled={isAnalyzing}>
              <Wand2 className="h-4 w-4 mr-2" />
              {isAnalyzing ? "Analyzing..." : "Start Analysis"}
            </Button>

            {(cleaningRecommendations.length > 0 || businessInsights.length > 0) && (
              <Button variant="outline" onClick={exportAnalysisReport}>
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            )}
          </div>

          {isOnline && (
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="useLocal"
                checked={useLocalKnowledge}
                onCheckedChange={(checked) => setUseLocalKnowledge(!!checked)}
              />
              <label htmlFor="useLocal" className="text-gray-600">
                Use local knowledge (faster)
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Analysis Progress */}
      {isAnalyzing && (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>
                  {isOnline && !useLocalKnowledge
                    ? "AI is analyzing your data..."
                    : "Analyzing with local knowledge base..."}
                </span>
                <span>{Math.round(analysisProgress)}%</span>
              </div>
              <Progress value={analysisProgress} className="w-full" />
              <div className="text-xs text-gray-500 text-center">
                {isOnline && !useLocalKnowledge
                  ? "This may take a few moments for comprehensive AI analysis"
                  : "Fast analysis using built-in expertise"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="recommendations">
            <Wand2 className="h-4 w-4 mr-1" />
            Fixes ({cleaningRecommendations.length})
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Lightbulb className="h-4 w-4 mr-1" />
            Insights ({businessInsights.length})
          </TabsTrigger>
          <TabsTrigger value="custom">
            <Brain className="h-4 w-4 mr-1" />
            Ask AI
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <BookOpen className="h-4 w-4 mr-1" />
            Learn
          </TabsTrigger>
        </TabsList>

        {/* Cleaning Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          {cleaningRecommendations.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Wand2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No recommendations yet</p>
                  <Button onClick={generateAiAnalysis} disabled={isAnalyzing}>
                    <Brain className="h-4 w-4 mr-2" />
                    Get Recommendations
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Selection Controls */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg">Data Cleaning Recommendations</CardTitle>
                      <CardDescription>Easy-to-understand suggestions to improve your data quality</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedRecommendations(new Set())}>
                        Clear Selection
                      </Button>
                      <Button onClick={applySelectedRecommendations} disabled={selectedRecommendations.size === 0}>
                        Apply Selected ({selectedRecommendations.size})
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Recommendations List */}
              {cleaningRecommendations.map((recommendation) => (
                <Card key={recommendation.id} className="overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedRecommendations.has(recommendation.id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedRecommendations)
                            if (checked) {
                              newSet.add(recommendation.id)
                            } else {
                              newSet.delete(recommendation.id)
                            }
                            setSelectedRecommendations(newSet)
                          }}
                        />
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {recommendation.impact === "high" && <AlertTriangle className="h-5 w-5 text-red-500" />}
                            {recommendation.impact === "medium" && <Info className="h-5 w-5 text-yellow-500" />}
                            {recommendation.impact === "low" && <CheckCircle className="h-5 w-5 text-green-500" />}
                            {recommendation.title}
                          </CardTitle>
                          <CardDescription className="mt-2 text-base">
                            {recommendation.userFriendlyExplanation}
                          </CardDescription>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Badge
                          variant={
                            recommendation.impact === "high"
                              ? "destructive"
                              : recommendation.impact === "medium"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {recommendation.impact} priority
                        </Badge>
                        <Badge variant="outline">{Math.round(recommendation.confidence * 100)}% confident</Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-4">
                      {/* Business Impact */}
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-medium text-blue-900 mb-2">Why This Matters for Your Business</h4>
                        <p className="text-blue-800 text-sm">{recommendation.businessImpact}</p>
                      </div>

                      {/* Step by Step Guide */}
                      {recommendation.stepByStepGuide && recommendation.stepByStepGuide.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">How to Fix This (Step by Step)</h4>
                          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                            {recommendation.stepByStepGuide.map((step, index) => (
                              <li key={index}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {/* Preview and Stats */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                          <Label className="text-sm font-medium">What Will Change</Label>
                          <p className="text-sm text-gray-600 mt-1">{recommendation.preview}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Affected Records</Label>
                          <p className="text-sm text-gray-600 mt-1">
                            {recommendation.affectedRows.toLocaleString()} out of {file.data.length.toLocaleString()}{" "}
                            records
                          </p>
                        </div>
                      </div>

                      {/* Code Examples (Collapsible) */}
                      <details className="border rounded p-3">
                        <summary className="cursor-pointer font-medium text-sm">
                          View Technical Implementation (Optional)
                        </summary>
                        <Tabs defaultValue="python" className="w-full mt-3">
                          <TabsList>
                            <TabsTrigger value="python">Python Code</TabsTrigger>
                            <TabsTrigger value="sql">SQL Code</TabsTrigger>
                          </TabsList>
                          <TabsContent value="python">
                            <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                              <code>{recommendation.code.python}</code>
                            </pre>
                          </TabsContent>
                          <TabsContent value="sql">
                            <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                              <code>{recommendation.code.sql}</code>
                            </pre>
                          </TabsContent>
                        </Tabs>
                      </details>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Business Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          {businessInsights.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Lightbulb className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No business insights yet</p>
                  <Button onClick={generateAiAnalysis} disabled={isAnalyzing}>
                    <Brain className="h-4 w-4 mr-2" />
                    Generate Insights
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {businessInsights.map((insight) => (
                <Card key={insight.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {insight.priority === "critical" && <AlertTriangle className="h-5 w-5 text-red-500" />}
                          {insight.priority === "high" && <AlertTriangle className="h-5 w-5 text-orange-500" />}
                          {insight.priority === "medium" && <Info className="h-5 w-5 text-yellow-500" />}
                          {insight.priority === "low" && <CheckCircle className="h-5 w-5 text-green-500" />}
                          {insight.title}
                        </CardTitle>
                        <CardDescription className="mt-2 text-base">{insight.userFriendlyExplanation}</CardDescription>
                      </div>
                      <Badge
                        variant={
                          insight.priority === "critical"
                            ? "destructive"
                            : insight.priority === "high"
                              ? "destructive"
                              : insight.priority === "medium"
                                ? "default"
                                : "secondary"
                        }
                      >
                        {insight.priority} priority
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-4">
                      {/* Business Impact */}
                      <div className="bg-yellow-50 p-4 rounded-lg">
                        <h4 className="font-medium text-yellow-900 mb-2">Business Impact</h4>
                        <p className="text-yellow-800 text-sm">{insight.impact}</p>
                      </div>

                      {/* Recommendation */}
                      <div className="bg-green-50 p-4 rounded-lg">
                        <h4 className="font-medium text-green-900 mb-2">What You Should Do</h4>
                        <p className="text-green-800 text-sm">{insight.recommendation}</p>
                      </div>

                      {/* Action Items */}
                      {insight.actionItems && insight.actionItems.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Specific Action Steps</h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                            {insight.actionItems.map((action, index) => (
                              <li key={index}>{action}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Metrics */}
                      {insight.metrics && (
                        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-red-600">{insight.metrics.before}%</p>
                            <p className="text-xs text-gray-500">Current State</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{insight.metrics.after}%</p>
                            <p className="text-xs text-gray-500">After Improvements</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">+{insight.metrics.improvement}%</p>
                            <p className="text-xs text-gray-500">Improvement</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Custom Analysis Tab */}
        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ask the AI Assistant</CardTitle>
              <CardDescription>
                Ask any question about your data in plain English. The AI will provide easy-to-understand answers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="customPrompt">Your Question</Label>
                  <Input
                    id="customPrompt"
                    placeholder="e.g., 'How can I improve my data quality?' or 'What should I fix first?'"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && generateCustomAnalysis()}
                  />
                </div>

                <Button
                  onClick={generateCustomAnalysis}
                  disabled={!customPrompt.trim() || isCustomAnalyzing}
                  className="w-full"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  {isCustomAnalyzing ? "Thinking..." : "Get Answer"}
                </Button>

                {customAnalysis && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-lg">AI Response</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-64">
                        <div className="whitespace-pre-wrap text-sm">{customAnalysis}</div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Knowledge Base Tab */}
        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Quality Learning Center</CardTitle>
              <CardDescription>Learn about data quality concepts and best practices in simple terms</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(LOCAL_KNOWLEDGE_BASE.dataQualityRules).map(([key, rule]) => (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle className="text-lg">{rule.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <p className="text-gray-700">{rule.explanation}</p>

                        <div className="bg-red-50 p-3 rounded">
                          <h4 className="font-medium text-red-900 mb-1">Business Impact</h4>
                          <p className="text-red-800 text-sm">{rule.businessImpact}</p>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Common Causes</h4>
                          <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                            {rule.commonCauses.map((cause, index) => (
                              <li key={index}>{cause}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Solutions</h4>
                          <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                            {rule.solutions.map((solution, index) => (
                              <li key={index}>{solution}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="bg-green-50 p-3 rounded">
                          <h4 className="font-medium text-green-900 mb-1">Prevention Tips</h4>
                          <ul className="list-disc list-inside text-green-800 text-sm space-y-1">
                            {rule.preventionTips.map((tip, index) => (
                              <li key={index}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
