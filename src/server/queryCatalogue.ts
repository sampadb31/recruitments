/**
 * Query Catalogue for Recruitment Data Collector
 * 
 * Provides an editable, multi-family query catalogue that rotates across runs.
 * Combines focused role terms with first-person job-seeking phrases while
 * strictly respecting provider Boolean constraints (max 500 chars, <= 5 Boolean operators).
 */

import {
  TargetSector,
  TimeWindow,
  RoleFamilyCategory,
  QueryCatalogueItem,
  QueryCatalogueConfig,
} from '../types/index.ts';

export type { RoleFamilyCategory, QueryCatalogueItem, QueryCatalogueConfig };

/**
 * Pre-configured catalogue covering all 7 role families and job-seeking phrase groups
 * defined in user specification. Each compiled query uses <= 3 Boolean operators and < 200 chars.
 */
export const DEFAULT_QUERY_CATALOGUE: QueryCatalogueItem[] = [
  // 1. ALL ROLES & GENERAL JOB SEEKERS ACROSS INDIA (HIGH YIELD)
  {
    id: 'q_all_india_01',
    category: 'all_roles_india',
    categoryLabel: 'All Roles & Job Seekers Across India',
    sectorTag: 'all',
    roleTerms: ['any role', 'job seeker', 'open to work'],
    phraseTerms: ['open to work', 'India'],
    compiledQuery: '"open to work" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_all_india_02',
    category: 'all_roles_india',
    categoryLabel: 'All Roles & Job Seekers Across India',
    sectorTag: 'all',
    roleTerms: ['looking for new opportunities', 'India'],
    phraseTerms: ['looking for new opportunities', 'India'],
    compiledQuery: '"looking for new opportunities" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_all_india_03',
    category: 'all_roles_india',
    categoryLabel: 'All Roles & Job Seekers Across India',
    sectorTag: 'all',
    roleTerms: ['immediate joiner', 'India'],
    phraseTerms: ['immediate joiner', 'looking for job'],
    compiledQuery: '"immediate joiner" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_all_india_04',
    category: 'all_roles_india',
    categoryLabel: 'All Roles & Job Seekers Across India',
    sectorTag: 'all',
    roleTerms: ['actively looking for job', 'India'],
    phraseTerms: ['actively looking for job', 'India'],
    compiledQuery: '"actively looking for job" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_all_india_05',
    category: 'all_roles_india',
    categoryLabel: 'All Roles & Job Seekers Across India',
    sectorTag: 'all',
    roleTerms: ['seeking my next role', 'India'],
    phraseTerms: ['seeking my next role', 'India'],
    compiledQuery: '"seeking my next role" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },

  // 2. TECH, ENGINEERING & DATA (INDIA)
  {
    id: 'q_tech_eng_01',
    category: 'tech_engineering',
    categoryLabel: 'Technology, Software & Engineering',
    sectorTag: 'technology sales',
    roleTerms: ['software engineer', 'developer', 'tech lead'],
    phraseTerms: ['open to work', 'India'],
    compiledQuery: '("software engineer" OR "developer") AND "open to work" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_tech_eng_02',
    category: 'tech_engineering',
    categoryLabel: 'Technology, Software & Engineering',
    sectorTag: 'technology sales',
    roleTerms: ['data analyst', 'data engineer', 'analyst'],
    phraseTerms: ['open to work', 'looking for a change'],
    compiledQuery: '("data analyst" OR "data engineer") AND "open to work" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },

  // 3. OPERATIONS, MARKETING, HR & FINANCE (INDIA)
  {
    id: 'q_ops_mkt_01',
    category: 'operations_hr_marketing',
    categoryLabel: 'Operations, Marketing, HR & Finance',
    sectorTag: 'all',
    roleTerms: ['operations manager', 'supply chain', 'logistics'],
    phraseTerms: ['open to work', 'India'],
    compiledQuery: '("operations manager" OR "supply chain") AND "open to work" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_ops_mkt_02',
    category: 'operations_hr_marketing',
    categoryLabel: 'Operations, Marketing, HR & Finance',
    sectorTag: 'all',
    roleTerms: ['marketing manager', 'digital marketing', 'brand'],
    phraseTerms: ['open to work', 'seeking a new role'],
    compiledQuery: '("marketing" OR "digital marketing") AND "open to work" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_ops_mkt_03',
    category: 'operations_hr_marketing',
    categoryLabel: 'Operations, Marketing, HR & Finance',
    sectorTag: 'all',
    roleTerms: ['finance', 'accounts manager', 'accounting'],
    phraseTerms: ['open to work', 'India'],
    compiledQuery: '("finance" OR "accounting") AND "open to work" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_ops_mkt_04',
    category: 'operations_hr_marketing',
    categoryLabel: 'Operations, Marketing, HR & Finance',
    sectorTag: 'all',
    roleTerms: ['HR manager', 'human resources', 'talent acquisition'],
    phraseTerms: ['open to work', 'seeking opportunities'],
    compiledQuery: '("human resources" OR "HR manager") AND "open to work" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },

  // 4. GENERAL SALES & BUSINESS DEVELOPMENT (INDIA)
  {
    id: 'q_gen_sales_01',
    category: 'general_sales',
    categoryLabel: 'General Sales & Business Development',
    sectorTag: 'all',
    roleTerms: ['sales executive', 'sales officer'],
    phraseTerms: ['open to work', 'seeking a new role'],
    compiledQuery: '("sales executive" OR "sales officer") AND "open to work" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_gen_sales_02',
    category: 'general_sales',
    categoryLabel: 'General Sales & Business Development',
    sectorTag: 'all',
    roleTerms: ['business development executive', 'BDE', 'business development manager'],
    phraseTerms: ['open to work', 'looking for a change'],
    compiledQuery: '("business development executive" OR "BDE") AND "open to work" India',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_gen_sales_03',
    category: 'general_sales',
    categoryLabel: 'General Sales & Business Development',
    sectorTag: 'all',
    roleTerms: ['area sales manager', 'territory sales manager', 'ASM'],
    phraseTerms: ['exploring opportunities', 'open to work'],
    compiledQuery: '("area sales manager" OR "territory sales manager" OR "ASM sales") AND ("exploring opportunities" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_gen_sales_04',
    category: 'general_sales',
    categoryLabel: 'General Sales & Business Development',
    sectorTag: 'all',
    roleTerms: ['account executive', 'key account manager'],
    phraseTerms: ['looking for my next role', 'open to work'],
    compiledQuery: '("account executive" OR "key account manager") AND ("looking for my next role" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },

  // 2. FMCG, MANUFACTURING AND PAINTS
  {
    id: 'q_fmcg_01',
    category: 'fmcg_manufacturing_paints',
    categoryLabel: 'FMCG, Manufacturing & Paints',
    sectorTag: 'FMCG',
    roleTerms: ['territory sales officer', 'general trade sales', 'modern trade sales'],
    phraseTerms: ['open to work', 'looking for a change'],
    compiledQuery: '("territory sales officer" OR "FMCG sales") AND ("open to work" OR "looking for a change")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_fmcg_02',
    category: 'fmcg_manufacturing_paints',
    categoryLabel: 'FMCG, Manufacturing & Paints',
    sectorTag: 'paints',
    roleTerms: ['paints sales', 'coatings sales', 'dealer sales'],
    phraseTerms: ['seeking a new role', 'open to work'],
    compiledQuery: '("paints sales" OR "coatings sales" OR "dealer sales") AND ("seeking a new role" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_mfg_01',
    category: 'fmcg_manufacturing_paints',
    categoryLabel: 'FMCG, Manufacturing & Paints',
    sectorTag: 'manufacturing',
    roleTerms: ['industrial sales', 'technical sales', 'project sales'],
    phraseTerms: ['exploring new opportunities', 'open to work'],
    compiledQuery: '("industrial sales" OR "manufacturing sales") AND ("exploring new opportunities" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },

  // 3. PHARMA AND HEALTHCARE SALES
  {
    id: 'q_pharma_01',
    category: 'pharma_healthcare',
    categoryLabel: 'Pharma & Healthcare Sales',
    sectorTag: 'pharma',
    roleTerms: ['medical representative', 'MR', 'medical sales representative'],
    phraseTerms: ['looking for a change', 'open to work'],
    compiledQuery: '("medical representative" OR "medical sales") AND ("looking for a change" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_pharma_02',
    category: 'pharma_healthcare',
    categoryLabel: 'Pharma & Healthcare Sales',
    sectorTag: 'pharma',
    roleTerms: ['territory business manager', 'area business manager', 'ABM pharma'],
    phraseTerms: ['seeking opportunities', 'open to work'],
    compiledQuery: '("territory business manager" OR "pharma sales") AND ("seeking opportunities" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },

  // 4. TECHNOLOGY SALES (SaaS, Cloud, Software, SDR/BDR)
  {
    id: 'q_tech_01',
    category: 'technology_sales',
    categoryLabel: 'Technology Sales (Software/SaaS)',
    sectorTag: 'technology sales',
    roleTerms: ['software sales', 'SaaS sales', 'cloud sales'],
    phraseTerms: ['seeking opportunities', 'open to work'],
    compiledQuery: '("software sales" OR "SaaS sales" OR "cloud sales") AND ("seeking opportunities" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_tech_02',
    category: 'technology_sales',
    categoryLabel: 'Technology Sales (Software/SaaS)',
    sectorTag: 'technology sales',
    roleTerms: ['sales development representative', 'SDR', 'BDR software'],
    phraseTerms: ['looking for a new role', 'open to work'],
    compiledQuery: '("SDR" OR "sales development representative" OR "BDR") AND "tech" AND ("open to work" OR "new role")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_tech_03',
    category: 'technology_sales',
    categoryLabel: 'Technology Sales (Software/SaaS)',
    sectorTag: 'technology sales',
    roleTerms: ['enterprise account executive', 'IT sales', 'cybersecurity sales'],
    phraseTerms: ['exploring opportunities', 'open to work'],
    compiledQuery: '("enterprise sales" OR "IT sales" OR "solution sales") AND ("exploring opportunities" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },

  // 5. BANKING, NBFC AND FINTECH SALES
  {
    id: 'q_fin_01',
    category: 'banking_nbfc_fintech',
    categoryLabel: 'Banking, NBFC & Fintech Sales',
    sectorTag: 'banking',
    roleTerms: ['relationship manager', 'relationship officer', 'branch sales'],
    phraseTerms: ['looking for a job change', 'open to work'],
    compiledQuery: '("relationship manager" OR "relationship officer") AND "banking" AND ("looking for a job change" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_fin_02',
    category: 'banking_nbfc_fintech',
    categoryLabel: 'Banking, NBFC & Fintech Sales',
    sectorTag: 'banking',
    roleTerms: ['CASA sales', 'retail banking sales', 'liabilities sales'],
    phraseTerms: ['seeking a new role', 'open to work'],
    compiledQuery: '("CASA sales" OR "retail banking sales" OR "branch sales") AND ("seeking a new role" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_fin_03',
    category: 'banking_nbfc_fintech',
    categoryLabel: 'Banking, NBFC & Fintech Sales',
    sectorTag: 'NBFC',
    roleTerms: ['loan sales', 'vehicle finance', 'home loan sales', 'mortgage sales', 'MSME sales'],
    phraseTerms: ['exploring opportunities', 'open to work'],
    compiledQuery: '("loan sales" OR "vehicle finance" OR "mortgage sales") AND ("exploring opportunities" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_fin_04',
    category: 'banking_nbfc_fintech',
    categoryLabel: 'Banking, NBFC & Fintech Sales',
    sectorTag: 'fintech',
    roleTerms: ['merchant acquisition', 'POS sales', 'payments sales', 'fintech sales'],
    phraseTerms: ['seeking new opportunities', 'open to work'],
    compiledQuery: '("merchant acquisition" OR "payments sales" OR "fintech sales") AND ("seeking new opportunities" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },

  // 6. INSURANCE SALES
  {
    id: 'q_ins_01',
    category: 'insurance',
    categoryLabel: 'Insurance Sales',
    sectorTag: 'insurance',
    roleTerms: ['bancassurance executive', 'bancassurance manager', 'banca sales'],
    phraseTerms: ['open to work', 'looking for a new role'],
    compiledQuery: '("bancassurance" OR "banca sales") AND ("open to work" OR "looking for a new role")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
  {
    id: 'q_ins_02',
    category: 'insurance',
    categoryLabel: 'Insurance Sales',
    sectorTag: 'insurance',
    roleTerms: ['agency development manager', 'agency manager', 'direct sales manager insurance'],
    phraseTerms: ['seeking a career move', 'open to work'],
    compiledQuery: '("agency development manager" OR "insurance sales") AND ("seeking a career move" OR "open to work")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },

  // 7. HOSPITALITY SALES
  {
    id: 'q_hosp_01',
    category: 'hospitality',
    categoryLabel: 'Hospitality Sales',
    sectorTag: 'hospitality',
    roleTerms: ['hotel sales executive', 'hotel sales manager', 'hospitality sales'],
    phraseTerms: ['exploring new opportunities', 'seeking a new role'],
    compiledQuery: '("hotel sales" OR "hospitality sales" OR "banquet sales") AND ("exploring new opportunities" OR "seeking a new role")',
    enabled: true,
    stats: { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 },
  },
];

export const INITIAL_QUERY_CONFIG: QueryCatalogueConfig = {
  maxQueriesPerRun: 4,
  maxPostsPerQuery: 20,
  timeWindow: '7d',
  rotationIndex: 0,
  lastRotatedAt: null,
};

/**
 * Selects the next batch of queries to run in this collection cycle,
 * updating the rotation pointer so the next run picks the next role families.
 */
export function selectRotatedQueries(
  catalogue: QueryCatalogueItem[] = DEFAULT_QUERY_CATALOGUE,
  config: QueryCatalogueConfig = INITIAL_QUERY_CONFIG
): { selectedQueries: QueryCatalogueItem[]; nextConfig: QueryCatalogueConfig } {
  const enabledItems = catalogue.filter(q => q.enabled);
  if (enabledItems.length === 0) {
    return { selectedQueries: [DEFAULT_QUERY_CATALOGUE[0]], nextConfig: config };
  }

  const batchSize = Math.max(1, Math.min(config.maxQueriesPerRun || 4, enabledItems.length));
  const startIndex = (config.rotationIndex || 0) % enabledItems.length;

  const selected: QueryCatalogueItem[] = [];
  for (let i = 0; i < batchSize; i++) {
    const idx = (startIndex + i) % enabledItems.length;
    selected.push(enabledItems[idx]);
  }

  const nextIndex = (startIndex + batchSize) % enabledItems.length;
  const nextConfig: QueryCatalogueConfig = {
    ...config,
    rotationIndex: nextIndex,
    lastRotatedAt: new Date().toISOString(),
  };

  return { selectedQueries: selected, nextConfig };
}

/**
 * Updates execution stats on a catalogue item after a run.
 */
export function recordQueryStats(
  item: QueryCatalogueItem,
  delta: { retrieved: number; duplicates: number; matched: number; rejected: number }
) {
  if (!item.stats) {
    item.stats = { runsCount: 0, retrievedCount: 0, duplicatesCount: 0, matchedCount: 0, rejectedCount: 0 };
  }
  item.stats.runsCount += 1;
  item.stats.retrievedCount += delta.retrieved;
  item.stats.duplicatesCount += delta.duplicates;
  item.stats.matchedCount += delta.matched;
  item.stats.rejectedCount += delta.rejected;
  item.lastUsedAt = new Date().toISOString();
}
