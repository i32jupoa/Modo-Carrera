/**
 * Sistema modular de transferencias
 * Inspirado en EA FC + Football Manager
 * 
 * Este módulo proporciona un sistema completo de mercado de fichajes con:
 * - Estrategias de club personalizadas
 * - Análisis de necesidades de plantilla
 * - Gestión de presupuestos dinámicos
 * - Contratos y salarios
 * - Personalidad de jugadores
 * - Valoración real de mercado
 * - Motor de transferencias con IA
 * - Sistema de negociaciones
 * - Simulación diaria del mercado
 */

// ============================================================================
// TIPOS
// ============================================================================

export type {
  ClubStrategy,
  Contract,
  ContractStatus,
  PlayerPersonality,
  PersonalityType,
  MarketValuation,
  TransferOffer,
  OfferStatus,
  OfferType,
  LoanDetails,
  SquadNeed,
  NeedPriority,
  SquadAnalysis,
  TransferRumor,
  RumorType,
  TransferRecord,
  TransferType,
  BudgetState,
  MarketSimulationState,
  TransferResult,
  OfferEvaluation,
  CandidateScore,
} from './types';

// ============================================================================
// CONSTANTES
// ============================================================================

export {
  TRANSFER_WINDOW_DAYS,
  DEADLINE_DAY_THRESHOLD,
  BUDGET_SPENDING_PERCENTAGE,
  WAGE_BILL_PERCENTAGE,
  INITIAL_BUDGET_BY_CATEGORY,
  CLUB_CATEGORY_RANGES,
  COMPETITION_MULTIPLIERS,
  STAR_PLAYER_MULTIPLIERS,
  VALUATION_RANGES,
  AGE_DISCOUNT,
  POTENTIAL_PREMIUM,
  OFFER_EXPIRY_DAYS,
  MAX_COUNTER_OFFERS,
  COUNTER_OFFER_INCREMENT_MIN,
  COUNTER_OFFER_INCREMENT_MAX,
  COUNTER_OFFER_PROBABILITY,
  OFFER_RESPONSE_DAYS,
  CONTRACT_DURATION_BY_AGE,
  WAGE_PERCENTAGE_OF_VALUE,
  CONTRACT_RENEWAL_THRESHOLD_DAYS,
  RENEWAL_PROBABILITY,
  RELEASE_CLAUSE_MULTIPLIER,
  IDEAL_SQUAD_COMPOSITION,
  MIN_SQUAD_COMPOSITION,
  IDEAL_AGE_BY_POSITION,
  MAX_AVERAGE_AGE,
  YOUTH_PERCENTAGE_IDEAL,
  MARKET_ACTION_INTERVAL_DAYS,
  MAX_SIMULTANEOUS_OFFERS,
  TRANSFER_SEARCH_PROBABILITY,
  DEADLINE_DAY_PROBABILITY,
  CANDIDATES_TO_EVALUATE,
  LOAN_DURATION,
  LOAN_WAGE_CONTRIBUTION,
  LOAN_OPTION_TO_BUY_PERCENTAGE,
  RUMOR_DURATION_DAYS,
  RUMOR_GENERATION_PROBABILITY,
  RUMOR_CREDIBILITY,
  BATCH_SIZE,
  MAX_PLAYERS_TO_SCAN,
  CACHE_DURATION_MS,
  REAL_MADRID_STRATEGY,
  BRIGHTON_STRATEGY,
  SEVILLA_STRATEGY,
  MAN_CITY_STRATEGY,
  BAYERN_STRATEGY,
  GENERIC_STRATEGY_BY_CATEGORY,
} from './constants';

// ============================================================================
// CLUB STRATEGY
// ============================================================================

export {
  getClubStrategy,
  generateAllStrategies,
  clearStrategyCache,
  shouldSeekTransfers,
  shouldSellPlayers,
  calculateMaxTransferSpend,
  calculateMinSalePrice,
  calculateInterestScore,
  willAcceptCounterOffer,
} from './ClubStrategy';

// ============================================================================
// SQUAD ANALYZER
// ============================================================================

export {
  analyzeSquad,
  clearAnalysisCache,
  clearClubAnalysisCache,
  getCriticalNeeds,
  getHighPriorityNeeds,
  sortNeedsByPriority,
  filterNeedsByPosition,
  calculatePositionDepth,
  identifyTransferablePlayers,
  identifyLoanablePlayers,
} from './SquadAnalyzer';

// ============================================================================
// BUDGET MANAGER
// ============================================================================

export {
  calculateInitialBudget,
  createInitialBudgetState,
  updateBudgetAfterSale,
  updateBudgetAfterPurchase,
  resetBudgetForNewWindow,
  calculateWeeklyWageBill,
  canAffordTransfer,
  calculateMaxTransferFee,
  calculateMaxWeeklyWage,
  getBudgetState,
  setBudgetState,
  clearBudgetCache,
  generateAllInitialBudgets,
  calculateBudgetSpentPercentage,
  calculateWageBillPercentage,
  isInFinancialCrisis,
  canSpendAggressively,
  calculateWeeklyAvailableBudget,
  projectEndOfWindowBudget,
} from './BudgetManager';

// ============================================================================
// CONTRACT ENGINE
// ============================================================================

export {
  generateContract,
  calculateContractDuration,
  calculateWeeklyWage,
  calculateReleaseClause,
  calculateSigningBonus,
  calculatePerformanceBonus,
  calculateEndDate,
  getContractStatus,
  shouldRenewContract,
  generateRenewalOffer,
  calculateTotalContractCost,
  calculateContractTerminationFee,
  getExpiringContracts,
  getExpiredContracts,
  filterContractsByClub,
  filterContractsByPlayer,
  sortContractsByWage,
  calculateClubWageBill,
  getHighestPaidContracts,
  cacheContract,
  getCachedContract,
  clearContractCache,
} from './ContractEngine';

// ============================================================================
// PLAYER DECISION
// ============================================================================

export {
  generatePlayerPersonality,
  decideOnTransferOffer,
  calculateMinimumAcceptableWage,
  wantsToLeaveClub,
  clearPersonalityCache,
  getCachedPersonality,
} from './PlayerDecision';

// ============================================================================
// MARKET VALUATION
// ============================================================================

export {
  calculateMarketValuation,
  calculateBaseValue,
  isStarPlayer,
  calculateCompetitionLevel,
  adjustValuationForBuyer,
  calculateListPrice,
  isOfferAcceptable,
  generateCounterOffer,
  calculateAgeDepreciation,
  projectFutureValue,
  clearValuationCache,
  getCachedValuation,
  formatMarketValue,
  compareValuations,
  isOvervalued,
  isUndervalued,
} from './MarketValuation';

// ============================================================================
// TRANSFER ENGINE
// ============================================================================

export {
  findTransferCandidates,
  selectBestCandidate,
  initiateTransferNegotiation,
  shouldSellPlayer,
  clearCandidateCache,
  filterCandidatesByPosition,
  sortCandidatesByScore,
  getTopNCandidates,
} from './TransferEngine';

// ============================================================================
// NEGOTIATION ENGINE
// ============================================================================

export {
  createTransferOffer,
  processIncomingOffer,
  acceptOffer,
  rejectOffer,
  createCounterOffer,
  processCounterOffer,
  withdrawOffer,
  isOfferExpired,
  markOfferAsExpired,
  simulateResponseTime,
  processPlayerDecision,
  addActiveNegotiation,
  getActiveNegotiations,
  removeActiveNegotiation,
  clearExpiredNegotiations,
  getPendingOffersForPlayer,
  canCounterOffer,
  getNegotiationHistory,
  calculateNegotiationProgress,
  isNegotiationNearCompletion,
} from './NegotiationEngine';

// ============================================================================
// MARKET SIMULATION
// ============================================================================

export {
  initializeMarketSimulation,
  simulateMarketDay,
  simulateDeadlineDay,
  resetForNewWindow,
  getSimulationState,
  getActiveOffers,
  getActiveRumors,
  clearSimulationState,
} from './MarketSimulation';

// ============================================================================
// INTEGRACIÓN
// ============================================================================

export {
  initializeTransferSystem,
  isTransferSystemInitialized,
  simulateMarketForDate,
  simulateMarketForDateRange,
  onMarketWindowOpen,
  onMarketWindowClose,
  isDeadlineDay,
  getClubBudgetState,
  getAllBudgetStates,
  setAllBudgetStates,
  resetTransferSystem,
  getTransferSystemStats,
  exportTransferSystemState,
  importTransferSystemState,
} from './integration';

// ============================================================================
// COMPATIBILIDAD
// ============================================================================

export {
  needsMigration,
  migrateSaveData,
  ensurePlayersStoreCompatibility,
  hasTransferSystemData,
  saveTransferSystemToStorage,
  loadTransferSystemFromStorage,
  clearTransferSystemFromStorage,
  getTransferSystemVersion,
  isVersionCompatible,
  getDiagnosticInfo,
} from './compatibility';

// ============================================================================
// RENDIMIENTO
// ============================================================================

export {
  measurePerformance,
  measureAsyncPerformance,
  createIndex,
  filterByIndex,
  processInBatches,
  deduplicate,
  intersection,
  difference,
  SmartCache,
  throttle,
  debounce,
  isQuadratic,
  estimateComplexity,
  memoize,
  memoizeWithLimit,
} from './performance';

// ============================================================================
// CESIONES
// ============================================================================

export {
  generateLoanDetails,
  calculateLoanOptionToBuy,
  isPlayerLoanEligible,
  shouldLoanPlayer,
  findLoanSuitors,
  processLoanRequest,
  shouldAcceptLoanOffer,
  endLoan,
  calculateLoanCost,
  generateLoanOffer,
  getLoanedOutPlayers,
  getLoanedInPlayers,
  isPlayerOnLoan,
  getLoanDestination,
  clearLoanDecisionCache,
  getCachedLoanDecision,
  cacheLoanDecision,
} from './LoanEngine';

// ============================================================================
// HISTORIAL
// ============================================================================

export {
  recordTransfer,
  getClubTransferHistory,
  getClubInboundTransfers,
  getClubOutboundTransfers,
  getPlayerTransferHistory,
  getTransfersInWindow,
  calculateClubSpendingInWindow,
  calculateClubIncomeInWindow,
  calculateClubNetBalanceInWindow,
  getMostExpensiveTransfersInWindow,
  getCheapestTransfersInWindow,
  getTransferStatsByType,
  searchTransfersByPlayer,
  searchTransfersByClub,
  clearClubTransferHistory,
  clearAllTransferHistory,
  exportTransferHistory,
  importTransferHistory,
  getTransferHistoryStats,
} from './TransferHistory';

// ============================================================================
// RUMORES
// ============================================================================

export {
  createRumor,
  generateRandomRumors,
  getPlayerRumors,
  getAllActiveRumors,
  getClubRumors,
  clearExpiredRumors,
  isRumorExpired,
  updateRumorCredibility,
  debunkRumor,
  clearAllRumors,
  clearPlayerRumors,
  exportRumors,
  importRumors,
  getRumorStats,
} from './RumorEngine';
