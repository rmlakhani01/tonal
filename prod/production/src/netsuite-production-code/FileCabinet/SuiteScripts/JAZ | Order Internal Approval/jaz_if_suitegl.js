/**
 * Module Description
 * 
 * Version Date Author Remarks 1.00 30 Jul 2019 User
 * 
 */
/**
 * Update History
 * Version				By					Date				Requested By					Description
 * V1					Vikash				13/03/2024			Ali/Binu						Modification for the order type "Spartan Race", that needs to hit the 71140 account for debit.
 * 
 */
function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
	/* nlapiLogExecution('DEBUG', 'transactionRecord', transactionRecord);
	nlapiLogExecution('DEBUG', 'standardLines', standardLines);
	nlapiLogExecution('DEBUG', 'customLines', customLines);
	nlapiLogExecution('DEBUG', 'book', book); */

	var ordertype = transactionRecord.getFieldValue('custbody_jaz_ordertype');
	var matrixaccount = '';
	if (ordertype == 1) { // Demo & Influencer Units
		// 71160 General & Admin : Marketing & Advertising : Demo and Influencer
		// Units
		matrixaccount = 726;
	} else if (ordertype == 2) { // Engineering units
		// 73050 Engineering : Development/Prototype Parts
		matrixaccount = 387;
	} else if(ordertype == 7){// Spartan Race
		//71100 General & Admin : Marketing & Advertising
		matrixaccount = 518;
	}
	nlapiLogExecution('Debug','ordertype=='+ordertype,'matrixaccount=='+matrixaccount);
	if (matrixaccount) {

		nlapiLogExecution('DEBUG', 'standardLines.getCount()', standardLines.getCount());
		for (var i = 0; i < standardLines.getCount(); i++) {
			var creditAmount = standardLines.getLine(i).getCreditAmount();
			var debitAmount = standardLines.getLine(i).getDebitAmount();
			var standardAccount = standardLines.getLine(i).getAccountId();
			nlapiLogExecution('DEBUG', 'creditAmount', creditAmount);
			nlapiLogExecution('DEBUG', 'debitAmount', debitAmount);
			nlapiLogExecution('DEBUG', 'account', standardAccount);

			if (standardAccount) {
				if (creditAmount != 0) {
					var newLineCredit = customLines.addNewLine();
					newLineCredit.setAccountId(standardLines.getLine(i - 1).getAccountId()); // 632 Cost of Goods Sold
					newLineCredit.setCreditAmount(creditAmount);
					newLineCredit.setMemo('Internal SO - Credit COGS');
				}
				if (debitAmount != 0) {
					var newLineDebit = customLines.addNewLine();
					newLineDebit.setAccountId(matrixaccount);
					newLineDebit.setDebitAmount(debitAmount);
					newLineDebit.setMemo('Internal SO - Debit');
				}
			}
		}
	}
}