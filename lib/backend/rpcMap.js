/**
 * RPC method name → handler function.
 * Usage: const handler = rpcMap[method]; const result = await handler(...args);
 */
import * as handlers from './index.js';

/** @type {Record<string, Function>} */
export const rpcMap = {
  // Menu
  getMenu: handlers.getMenu,
  saveMenuItem: handlers.saveMenuItem,
  updateMenuItem: handlers.updateMenuItem,
  deleteMenuItem: handlers.deleteMenuItem,
  updateMenuAvailability: handlers.updateMenuAvailability,

  // Inventory
  getInventory: handlers.getInventory,
  addIngredient: handlers.addIngredient,
  updateIngredient: handlers.updateIngredient,
  deleteIngredient: handlers.deleteIngredient,

  // Mix hat
  getMixHats: handlers.getMixHats,
  upsertMixHat: handlers.upsertMixHat,
  deleteMixHat: handlers.deleteMixHat,
  getMixHatPickerSeeds: handlers.getMixHatPickerSeeds,

  // Orders
  saveOrder: handlers.saveOrder,
  savePickupOnlineOrder: handlers.savePickupOnlineOrder,
  getOrders: handlers.getOrders,
  mapOrderRow: handlers.mapOrderRow,
  checkBankTransferPayment: handlers.checkBankTransferPayment,
  cancelAwaitingBankOrder: handlers.cancelAwaitingBankOrder,
  confirmManualTransferPayment: handlers.confirmManualTransferPayment,
  confirmAwaitingOrderPaidCashRemainder: handlers.confirmAwaitingOrderPaidCashRemainder,
  getOnlineOrdersForAdmin: handlers.getOnlineOrdersForAdmin,
  updateOnlineOrderStatus: handlers.updateOnlineOrderStatus,
  getOnlineOrderStatusPublic: handlers.getOnlineOrderStatusPublic,
  submitDrinkFeedback: handlers.submitDrinkFeedback,

  // Group orders
  createGroupOrder: handlers.createGroupOrder,
  getGroupOrder: handlers.getGroupOrder,
  joinGroupOrder: handlers.joinGroupOrder,
  syncGroupCart: handlers.syncGroupCart,
  leaveGroupOrder: handlers.leaveGroupOrder,
  setGroupOrderLock: handlers.setGroupOrderLock,
  finalizeGroupOrder: handlers.finalizeGroupOrder,

  // Customers
  getCustomers: handlers.getCustomers,
  saveCustomer: handlers.saveCustomer,
  ensureCustomerForPos: handlers.ensureCustomerForPos,
  getPosCustomerInsight: handlers.getPosCustomerInsight,
  getPosCustomerBasic: handlers.getPosCustomerBasic,
  getOrdersByPhone: handlers.getOrdersByPhone,
  resolveCustomerIdentifier: handlers.resolveCustomerIdentifier,
  lookupCustomer: handlers.lookupCustomer,

  // Promotions
  getPromotions: handlers.getPromotions,
  getPromotionsAdmin: handlers.getPromotionsAdmin,
  applyPromoCode: handlers.applyPromoCode,
  validatePromo: handlers.validatePromo,
  savePromotion: handlers.savePromotion,
  getCheckoutPromoOptions: handlers.getCheckoutPromoOptions,
  getSuggestedPromosWithContext: handlers.getSuggestedPromosWithContext,
  applyPromoTemplate: handlers.applyPromoTemplate,
  applyPickupPromo: handlers.applyPickupPromo,
  getTodayPromoDigest: handlers.getTodayPromoDigest,
  getPromoImpactSummary: handlers.getPromoImpactSummary,

  // Member portal
  memberPortalLookup: handlers.memberPortalLookup,
  memberPortalBootstrapPayload_: handlers.memberPortalBootstrapPayload_,
  memberPortalBootstrapPayload: handlers.memberPortalBootstrapPayload,
  getMemberPortalSettings: handlers.getMemberPortalSettings,
  saveMemberPortalSettings: handlers.saveMemberPortalSettings,
  getSiteBrand: handlers.getSiteBrand,
  saveSiteBrand: handlers.saveSiteBrand,
  getMemberDeliveryZones: handlers.getMemberDeliveryZones,
  saveMemberDeliveryZones: handlers.saveMemberDeliveryZones,
  getMemberProfile: handlers.getMemberProfile,
  saveMemberProfile: handlers.saveMemberProfile,
  changeMemberPhone: handlers.changeMemberPhone,
  deleteMemberAccount: handlers.deleteMemberAccount,
  registerMemberPortalCustomer: handlers.registerMemberPortalCustomer,
  getMemberOrderHistory: handlers.getMemberOrderHistory,
  getPromoCampaignsAdmin: handlers.getPromoCampaignsAdmin,
  savePromoCampaign: handlers.savePromoCampaign,
  deletePromoCampaign: handlers.deletePromoCampaign,
  getMemberNotificationsPayload: handlers.getMemberNotificationsPayload,
  memberSaveDeliveryPrefs: handlers.memberSaveDeliveryPrefs,
  getMemberPortalScheduleAdvice: handlers.getMemberPortalScheduleAdvice,

  // Membership
  getMembershipPackages: handlers.getMembershipPackages,
  registerMembershipSubscription: handlers.registerMembershipSubscription,
  lookupMembershipByPhone: handlers.lookupMembershipByPhone,
  membershipQuotePackage: handlers.membershipQuotePackage,
  checkMembershipBankPayment: handlers.checkMembershipBankPayment,
  adminListMembershipSubscriptions: handlers.adminListMembershipSubscriptions,
  adminSaveMembershipPackage: handlers.adminSaveMembershipPackage,
  adminUpdateMembershipSubscription: handlers.adminUpdateMembershipSubscription,
  markMembershipDeliverySession: handlers.markMembershipDeliverySession,
  getMembershipDeliveriesToday: handlers.getMembershipDeliveriesToday,
  getMemberDeliveriesTodayEnriched: handlers.getMemberDeliveriesTodayEnriched,
  adminMembershipCostCalc: handlers.adminMembershipCostCalc,

  // Dashboard / reports
  getDashboardData: handlers.getDashboardData,
  getCashFlowReport: handlers.getCashFlowReport,
  getShiftData: handlers.getShiftData,
  getSuppliers: handlers.getSuppliers,
  saveSupplier: handlers.saveSupplier,
  updateSupplier: handlers.updateSupplier,
  getPartners: handlers.getPartners,
  savePartner: handlers.savePartner,
  deletePartnerByRow: handlers.deletePartnerByRow,
  saveOperatingCost: handlers.saveOperatingCost,
  getCapitalReport: handlers.getCapitalReport,
  getFixedAssets: handlers.getFixedAssets,
  saveFixedAsset: handlers.saveFixedAsset,
  updateFixedAsset: handlers.updateFixedAsset,
  deleteFixedAssetByRow: handlers.deleteFixedAssetByRow,
  getTaxDeclarationSupport: handlers.getTaxDeclarationSupport,

  // Stock
  logStockTransaction: handlers.logStockTransaction,
  getStockReportAdvanced: handlers.getStockReportAdvanced,
  getStockLedgerRange: handlers.getStockLedgerRange,
  saveRecipe: handlers.saveRecipe,
  getCostHistory: handlers.getCostHistory,

  // AI
  getAISuggestion: handlers.getAISuggestion,
  suggestMenuDescriptionShort: handlers.suggestMenuDescriptionShort,
  suggestMenuBenefitsPro: handlers.suggestMenuBenefitsPro,
  suggestMenuNutritionAndBenefitsBundle: handlers.suggestMenuNutritionAndBenefitsBundle,
  testSunAdminGemini: handlers.testSunAdminGemini,

  // Admin / media
  getSunAdminApiConfig: handlers.getSunAdminApiConfig,
  saveSunAdminApiConfig: handlers.saveSunAdminApiConfig,
  getSunImgbbClientUploadKey: handlers.getSunImgbbClientUploadKey,
  uploadProductImageToDrive: handlers.uploadProductImageToDrive,
  uploadProductImageToImgbb: handlers.uploadProductImageToImgbb,
  saveAiImageUrlToDrive: handlers.saveAiImageUrlToDrive,
  testSunAdminDriveFolder: handlers.testSunAdminDriveFolder,
  getInvoicePrintSettings: handlers.getInvoicePrintSettings,
  saveInvoicePrintSettings: handlers.saveInvoicePrintSettings,
  setScriptProperties: handlers.setScriptProperties,
  clearScriptProperties: handlers.clearScriptProperties,
};

export default rpcMap;

/**
 * Invoke an RPC method by name.
 * @param {string} method
 * @param {unknown[]} args
 */
export async function invokeRpc(method, args = []) {
  const fn = rpcMap[method];
  if (!fn) {
    throw new Error(`Unknown RPC method: ${method}`);
  }
  return fn(...(Array.isArray(args) ? args : [args]));
}
