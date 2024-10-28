/*************************************************************
* File Header
* Script Type: Custom GL
* Script Name: Tonal GL Plugin Invoice Standalone Accessories
* File Name  : Tonal_GL_Plugin_Invoice_Standalone_Accessories.js
* Created On : 11/27/2023
* Modified On: 
* Created By : Vikash Kumar (Yantra Inc.)
* Modified By: 
* Description: This is used for hit the COGS account for credit and debit based on Standalone Accessories for invoices
************************************************************/
/**
 * Change History
 * Version		By			Date			Requestd By					Description
 * V1			Vikash		02/07/2024		Ali							Modification as per the jira ticket [ES-3163] as on 02/07/2024
 * V1			Vikash		02/23/2024		Ali/EV						Modification as per the jira ticket [ES-3333] as on 02/23/2024
 * V2			Vikash		04/15/2024		Ali/EV/Binu					Modification for the worng account hits for Kit items, GL plugin should not hit fo kit items
 */
function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
	try {
		var scriptObj = nlapiGetContext();
		var environment = scriptObj.getEnvironment();
		if(environment == 'SANDBOX'){
			var ri_ca = 649; //40250 - Hardware - Accessories//needs to check//in sb name of account is 40200
			var ri_da = 351; //40100 - Hardware - Trainer
			// var refurbishedItem = 2624;
			var a_ca = 354;//50100 COGS - Trainer
			var t_da = 968;//50160 - COGS - Trainer ReInstallation
		}

		if(environment == 'PRODUCTION'){
			var ri_ca = 649;//40250 - Hardware - Accessories
			var ri_da = 351;//40100 - Hardware - Trainer
			// var refurbishedItem = 3224;
			var a_ca = 354;//50100 COGS - Trainer
			var t_da = 968;//50160 - COGS - Trainer ReInstallation
		}

		var tranType = transactionRecord.getRecordType();
		/* var recId = transactionRecord.getRecordId(); */
		nlapiLogExecution('Debug','Transaction Type==',tranType);

		/* var location = transactionRecord.getFieldValue('custbody_sales_order_location'); */

		/* var lineLocation = transactionRecord.getLineItemValue('item','location',1); */

		//get the transaction line data
		var lineCount = transactionRecord.getLineItemCount('item');
		nlapiLogExecution('Debug','Line Count',lineCount);
		var glLineAdded = false;
		for(var l = 1 ; l <= lineCount ; l++){
			var itemId = transactionRecord.getLineItemValue('item','item',l);
			var itemAmount = transactionRecord.getLineItemValue('item','amount',l);
			var itemType = transactionRecord.getLineItemValue('item','itemtype',l);
			nlapiLogExecution('Debug','itemType==',itemType);
			if(itemType == 'InvtPart'){
				var value = nlapiLookupField("item", itemId, "custitem1");
				if((value == 3 || value == 2) && itemAmount > Number(0)){
					//credit line
					var newLineCredit = customLines.addNewLine();
					newLineCredit.setAccountId(Number(ri_ca)); 
					newLineCredit.setCreditAmount(Number(itemAmount));
					/* newLineCredit.setLocationId(Number(lineLocation)); */
					newLineCredit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
					/* newLineCredit.setDepartmentId(Number(salesDep));
					newLineCredit.setMemo('COGS - Credit'); */

					//debit line
					var newLineDebit = customLines.addNewLine();
					newLineDebit.setAccountId(Number(ri_da));
					newLineDebit.setDebitAmount(Number(itemAmount));
					/* newLineDebit.setLocationId(Number(location)); */
					newLineDebit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
					/* newLineDebit.setDepartmentId(Number(salesDep));
					newLineDebit.setMemo('COGS - Debit'); */
					glLineAdded = true;
				}
			}
			// if(itemType == 'Kit'){
			// 	var value = nlapiLookupField("item", itemId, "custitem1");
			// 	if(value == 7){
			// 		//get reallocation kit items
			// 		var reallocationKitItems = getReallocationKitItems(itemId);
			// 		nlapiLogExecution('Debug','reallocationKitItems=='+reallocationKitItems.length,JSON.stringify(reallocationKitItems));
			// 		if(reallocationKitItems.length > 0){
			// 			for(var r = 0 ; r < reallocationKitItems.length ; r++){
			// 				var lp = reallocationKitItems[r].lastPurchasePrice;
			// 				if(lp != Number(0)){
			// 					//credit line
			// 					var newLineCredit = customLines.addNewLine();
			// 					newLineCredit.setAccountId(Number(a_ca)); 
			// 					newLineCredit.setCreditAmount(Number(lp));
			// 					/* newLineCredit.setLocationId(Number(lineLocation)); */
			// 					newLineCredit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
			// 					/* newLineCredit.setDepartmentId(Number(salesDep));
			// 					newLineCredit.setMemo('COGS - Credit'); */
		
			// 					//debit line
			// 					var newLineDebit = customLines.addNewLine();
			// 					newLineDebit.setAccountId(Number(t_da));
			// 					newLineDebit.setDebitAmount(Number(lp));
			// 					/* newLineDebit.setLocationId(Number(location)); */
			// 					newLineDebit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
			// 					/* newLineDebit.setDepartmentId(Number(salesDep));
			// 					newLineDebit.setMemo('COGS - Debit'); */
			// 					glLineAdded = true;
			// 				}
			// 			}
			// 		}
			// 	}
			// }
		}
		nlapiLogExecution('Debug','Gl Line Added',glLineAdded);
			
	} catch (error) {
		nlapiLogExecution('ERROR','MAIN GL EXCEPTION',error);
	}
}

//function to get the realocation kits items types
function getReallocationKitItems(itemIds){
	try {
		var itemSearch = nlapiSearchRecord("item",null,
			[
				["custitem1","anyof",7], 
				"AND", 
				["isinactive","is","F"],
				"AND",
				["internalid","anyof",itemIds]
			], 
			[
				new nlobjSearchColumn("itemid").setSort(false), 
				new nlobjSearchColumn("lastpurchaseprice","memberItem",null), 
				new nlobjSearchColumn("memberitem"), 
				new nlobjSearchColumn("internalid","memberItem",null)
			]
		);
		var data = [];
		if(itemSearch != null){
			for(var i = 0; i < itemSearch.length; i++){
				data.push({
					itemSku:itemSearch[i].getValue('itemid'),
					itemId:itemSearch[i].getId(),
					lastPurchasePrice:itemSearch[i].getValue('lastpurchaseprice','memberItem')||Number(0)
				});
			}
		}
		return data;
	} catch (error) {
		nlapiLogExecution('Debug','Error : In Get Reallocation Kit Items',error);
		return [];
	}
}