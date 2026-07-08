import { extractGemPdf } from './src/extractor/parser.js';
const pdfPath = process.argv[2] || 'C:/Users/vr812/Downloads/GeM-Bidding-9518683 (1).pdf';
const result = await extractGemPdf(pdfPath);
const a = result.aiExtract, e = a?.eligibility;
console.log('=== TOP-LEVEL ===');
['bidNumber','bidEndDate','bidOpeningDate','bidType','bidToRA','bidOfferValidityDays','epbgRequired','bidValue','emdAmount','itemCategory','totalQuantity'].forEach(k=>console.log(`  ${k.padEnd(28)}: ${JSON.stringify(a?.[k])}`));
console.log('\n=== ELIGIBILITY ===');
['minAnnualTurnover','yearsOfExperience','mseExemption','startupExemption','msePurchasePreference','miiPurchasePreference','technicalClarificationDays','inspectionRequired','pastPerformancePct','evaluationMethod','arbitrationClause','mediationClause','typeOfBid'].forEach(k=>console.log(`  ${k.padEnd(28)}: ${JSON.stringify(e?.[k])}`));
