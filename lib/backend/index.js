/**
 * Public RPC handlers — ported from Code (10).gs
 * Wire via lib/backend/rpcMap.js in a Next.js API route.
 */

// Menu
export {
  getMenu,
  saveMenuItem,
  updateMenuItem,
  deleteMenuItem,
  updateMenuAvailability,
} from './menu.js';

// Inventory
export {
  getInventory,
  addIngredient,
  updateIngredient,
  deleteIngredient,
} from './inventory.js';

// Mix hat
export {
  getMixHats,
  upsertMixHat,
  deleteMixHat,
  getMixHatPickerSeeds,
} from './mixHat.js';

// Orders
export {
  saveOrder,
  savePickupOnlineOrder,
  getOrders,
  mapOrderRow,
  checkBankTransferPayment,
  cancelAwaitingBankOrder,
  confirmManualTransferPayment,
  confirmAwaitingOrderPaidCashRemainder,
  getOnlineOrdersForAdmin,
  updateOnlineOrderStatus,
  getOnlineOrderStatusPublic,
  submitDrinkFeedback,
  createGroupOrder,
  getGroupOrder,
  joinGroupOrder,
  syncGroupCart,
  leaveGroupOrder,
  setGroupOrderLock,
  finalizeGroupOrder,
} from './orders.js';

// Customers
export {
  getCustomers,
  saveCustomer,
  ensureCustomerForPos,
  getPosCustomerInsight,
  getPosCustomerBasic,
  getOrdersByPhone,
  lookupCustomer,
} from './customers.js';

// Promotions
export {
  getPromotions,
  getPromotionsAdmin,
  applyPromoCode,
  validatePromo,
  savePromotion,
  getCheckoutPromoOptions,
  getSuggestedPromosWithContext,
  applyPromoTemplate,
  applyPickupPromo,
  getTodayPromoDigest,
  getPromoImpactSummary,
} from './promotions.js';

// Members / portal
export {
  memberPortalLookup,
  memberPortalBootstrapPayload,
  getMemberPortalSettings,
  saveMemberPortalSettings,
  getMemberDeliveryZones,
  saveMemberDeliveryZones,
  getMemberProfile,
  saveMemberProfile,
  changeMemberPhone,
  deleteMemberAccount,
  registerMemberPortalCustomer,
  getMemberOrderHistory,
  memberSaveDeliveryPrefs,
  resolveCustomerIdentifier,
} from './members.js';

export { getSiteBrand, saveSiteBrand } from './siteBrand.js';

// Membership subscriptions
export {
  getMembershipPackages,
  registerMembershipSubscription,
  lookupMembershipByPhone,
  membershipQuotePackage,
  checkMembershipBankPayment,
  getMemberPortalScheduleAdvice,
  adminListMembershipSubscriptions,
  adminSaveMembershipPackage,
  adminUpdateMembershipSubscription,
  markMembershipDeliverySession,
  getMembershipDeliveriesToday,
  getMemberDeliveriesTodayEnriched,
  adminMembershipCostCalc,
} from './membership.js';

// Reports / dashboard
export {
  getDashboardData,
  getCashFlowReport,
  getShiftData,
  getSuppliers,
  saveSupplier,
  updateSupplier,
  getPartners,
  savePartner,
  deletePartnerByRow,
  saveOperatingCost,
  getCapitalReport,
  getFixedAssets,
  saveFixedAsset,
  updateFixedAsset,
  deleteFixedAssetByRow,
  getTaxDeclarationSupport,
} from './reports.js';

// Stock / recipes
export {
  logStockTransaction,
  getStockReportAdvanced,
  getStockLedgerRange,
  saveRecipe,
  getCostHistory,
} from './stock.js';

// AI
export {
  getAISuggestion,
  suggestMenuDescriptionShort,
  suggestMenuBenefitsPro,
  suggestMenuNutritionAndBenefitsBundle,
  testSunAdminGemini,
} from './ai.js';

// Notifications / promo campaigns
export {
  getPromoCampaignsAdmin,
  savePromoCampaign,
  deletePromoCampaign,
  getMemberNotificationsPayload,
} from './notifications.js';

// Admin / media / config
export {
  getSunAdminApiConfig,
  saveSunAdminApiConfig,
  getSunImgbbClientUploadKey,
  uploadProductImageToDrive,
  uploadProductImageToImgbb,
  saveAiImageUrlToDrive,
  testSunAdminDriveFolder,
  getInvoicePrintSettings,
  saveInvoicePrintSettings,
  setScriptProperties,
  clearScriptProperties,
} from './admin.js';

/** GAS alias: memberPortalBootstrapPayload_ */
export { memberPortalBootstrapPayload as memberPortalBootstrapPayload_ } from './members.js';
