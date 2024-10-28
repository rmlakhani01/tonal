/*************************************************************
* File Header
* Script Type: Custom GL
* Script Name: Tonal GL Plugin Item Fulfilment Standalone Accessories B Stock Units
* File Name  : Tonal_GL_Plugin_Item_Fulfilment_Standalone_Accessories_B_Stock_Units.js
* Created On : 11/24/2023
* Modified On: 
* Created By : Vikash Kumar (Yantra Inc.)
* Modified By: 
* Description: This is used for hit the COGS account for credit and debit based on Standalone Accessories B Stock Units
************************************************************/
/**
 * Change History
 * Version		By			Date			Requestd By					Description
 * V1			Vikash		02/07/2024		Ali							Modification as per the jira ticket [ES-3162] as on 02/07/2024
 * V2			Vikash		02/14/2024		Ali							Modification as per the jira ticket [ES-3343] as on 02/14/2024        
 * V3			Vikash		02/22/2024		Ali/EV						Modification for the jira ticket [ES-3343] as on 02/22/2024
 */
function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
	try {
		var scriptObj = nlapiGetContext();
		var environment = scriptObj.getEnvironment();
		if(environment == 'SANDBOX'){
			var a_ca = 354;//50100 COGS - Trainer
			var a_da = 648;//50250 COGS - Tonal Accessories
			var b_da = 1202;//50105 - COGS - B stock Trainer
			var bStockItem = 1630;//TR0001//1208;//150-0016
			var t_da = 968;//50160 - COGS - Trainer ReInstallation
		}

		if(environment == 'PRODUCTION'){
			var a_ca = 354;//50100 COGS - Trainer
			var a_da = 648;//50250 COGS - Tonal Accessories
			var b_da = 1238;//50105 - COGS - B stock Trainer
			var bStockItem = 3224;//TR0001//1630;//150-0016
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
		//loop over the lines and check items are standalone accessories or B stock types
		var itemIds = [];
		for(var l = 1 ; l <= lineCount ; l++){
			var itemId = transactionRecord.getLineItemValue('item','item',l);
			itemIds.push(itemId);
		}

		nlapiLogExecution('Debug','itemIds=='+itemIds.length,JSON.stringify(itemIds));

		//make a search for the item where 'is accessary' is true
		var asseccaryItems = getIsAccesaoryItems(itemIds);
		nlapiLogExecution('Debug','asseccaryItems=='+asseccaryItems.length,JSON.stringify(asseccaryItems));

		//get reallocation kit items
		var reallocationKitItems = getReallocationKitItems(itemIds);
		nlapiLogExecution('Debug','reallocationKitItems=='+reallocationKitItems.length,JSON.stringify(reallocationKitItems));

		var glLineAdded = false;
		if(asseccaryItems.length > 0){
			nlapiLogExecution('Debug','Case1','Running..');
			for(var a = 0 ; a < itemIds.length ; a++){
				var asseccaryData = asseccaryItems.filter(function(obj){
					return obj.itemId == itemIds[a];
				});

				nlapiLogExecution('Debug','asseccaryData=='+asseccaryData.length,JSON.stringify(asseccaryData));

				// add gl lines
				if(asseccaryData.length > 0){

					if(asseccaryData[0].itemId != bStockItem){
						//credit line
						var newLineCredit = customLines.addNewLine();
						newLineCredit.setAccountId(Number(a_ca)); 
						newLineCredit.setCreditAmount(Number(asseccaryData[0].lastPurchasePrice));
						/* newLineCredit.setLocationId(Number(lineLocation)); */
						newLineCredit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
						/* newLineCredit.setDepartmentId(Number(salesDep));
						newLineCredit.setMemo('COGS - Credit'); */

						//debit line
						var newLineDebit = customLines.addNewLine();
						newLineDebit.setAccountId(Number(a_da));
						newLineDebit.setDebitAmount(Number(asseccaryData[0].lastPurchasePrice));
						/* newLineDebit.setLocationId(Number(location)); */
						newLineDebit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
						/* newLineDebit.setDepartmentId(Number(salesDep));
						newLineDebit.setMemo('COGS - Debit'); */
						glLineAdded = true;
					}
					
				}
			}
		}
		if(reallocationKitItems.length > 0){
			nlapiLogExecution('Debug','Case2','Running..');
			for(var a = 0 ; a < itemIds.length ; a++){
				var reallocationKitItemData = reallocationKitItems.filter(function(obj){
					return obj.itemId == itemIds[a];
				});

				nlapiLogExecution('Debug','reallocationKitItemData=='+reallocationKitItemData.length,JSON.stringify(reallocationKitItemData));

				// add gl lines
				if(reallocationKitItemData.length > 0){

					for(var r = 0 ; r < reallocationKitItemData.length ; r++){

						if(reallocationKitItemData[r].itemId != bStockItem){
							var lp = reallocationKitItemData[r].lastPurchasePrice;
							if(lp != Number(0)){
								//credit line
								var newLineCredit = customLines.addNewLine();
								newLineCredit.setAccountId(Number(a_ca)); 
								newLineCredit.setCreditAmount(Number(lp));
								/* newLineCredit.setLocationId(Number(lineLocation)); */
								newLineCredit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
								/* newLineCredit.setDepartmentId(Number(salesDep));
								newLineCredit.setMemo('COGS - Credit'); */
		
								//debit line
								var newLineDebit = customLines.addNewLine();
								newLineDebit.setAccountId(Number(t_da));
								newLineDebit.setDebitAmount(Number(lp));
								/* newLineDebit.setLocationId(Number(location)); */
								newLineDebit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
								/* newLineDebit.setDepartmentId(Number(salesDep));
								newLineDebit.setMemo('COGS - Debit'); */
								glLineAdded = true;
							}
						}
					}
					
				}
			}
		}
		else{
			nlapiLogExecution('Debug','Case3','Running..');
			for(var a = 0 ; a < itemIds.length ; a++){
				if(itemIds[a] == bStockItem){
					var bstockItemMembers = getItemComponentsDetails(itemIds[a]);
					nlapiLogExecution('Debug','bstockItemMembers=='+bstockItemMembers.length,JSON.stringify(bstockItemMembers));
					if(bstockItemMembers.length > 0){
						for(var d = 0 ; d < bstockItemMembers.length ; d++){
							// nlapiLogExecution('Debug','bstockItemMembers[d]=='+d,JSON.stringify(bstockItemMembers[d]));
							var lastPurchasePrice = bstockItemMembers[d].lastPurchasePrice;
							// nlapiLogExecution('Debug','lastPurchasePrice',lastPurchasePrice);
							
							if(Number(lastPurchasePrice) != Number(0)){
								//credit line
								var newLineCredit = customLines.addNewLine();
								newLineCredit.setAccountId(Number(a_ca)); 
								newLineCredit.setCreditAmount(lastPurchasePrice);
								/* newLineCredit.setLocationId(Number(lineLocation)); */
								newLineCredit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
								/* newLineCredit.setDepartmentId(Number(salesDep));
								newLineCredit.setMemo('COGS - Credit'); */

								//debit line
								var newLineDebit = customLines.addNewLine();
								newLineDebit.setAccountId(Number(b_da));
								newLineDebit.setDebitAmount(lastPurchasePrice);
								/* newLineDebit.setLocationId(Number(location)); */
								newLineDebit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
								/* newLineDebit.setDepartmentId(Number(salesDep));
								newLineDebit.setMemo('COGS - Debit'); */
								glLineAdded = true;
							}
						}
					}
				}
			}
		}
		nlapiLogExecution('Debug','Gl Line Added',glLineAdded);
	} catch (error) {
		nlapiLogExecution('ERROR','MAIN GL EXCEPTION',error);
	}
}

//function to get the accessories items
function getIsAccesaoryItems(itemIds){
	try {
		var itemSearch = nlapiSearchRecord("item",null,
			[
				[["custitem1","is",2],"OR",["custitem1","is",3]], 
				"AND", 
				["isinactive","is","F"],
				"AND",
				["internalid","anyof",itemIds]
			], 
			[
				new nlobjSearchColumn("itemid").setSort(false), 
				new nlobjSearchColumn("displayname"), 
				new nlobjSearchColumn("type"),
				new nlobjSearchColumn("lastpurchaseprice")
			]
		);
		var data = [];
		if(itemSearch != null){
			for(var i = 0; i < itemSearch.length; i++){
				data.push({
					itemSku:itemSearch[i].getValue('itemid'),
					itemId:itemSearch[i].getId(),
					lastPurchasePrice:itemSearch[i].getValue('lastpurchaseprice')
				});
			}
		}
		return data;
	} catch (error) {
		nlapiLogExecution('Debug','Error : In Get Accessory Items',error);
		return [];
	}
}

//function to get the item components details
function getItemComponentsDetails(itemId){
	try {
		var itemSearch = nlapiSearchRecord("item",null,
		[
			["internalid","anyof",itemId], 
			"AND", 
			["isinactive","is","F"]
		], 
		[
			new nlobjSearchColumn("itemid").setSort(false), 
			new nlobjSearchColumn("displayname"), 
			new nlobjSearchColumn("salesdescription"), 
			new nlobjSearchColumn("type"), 
			new nlobjSearchColumn("lastpurchaseprice"), 
			new nlobjSearchColumn("itemid","memberItem",null), 
			new nlobjSearchColumn("lastpurchaseprice","memberItem",null), 
			new nlobjSearchColumn("internalid","memberItem",null)
		]
		);
		var data = [];
		if(itemSearch != null){
			for(var i = 0 ; i < itemSearch.length; i++){
				data.push({
					itemSku:itemSearch[i].getValue('itemid','memberItem'),
					itemId:itemSearch[i].getValue("internalid","memberItem"),
					lastPurchasePrice:itemSearch[i].getValue('lastpurchaseprice','memberItem')||Number(0),
					parentItem:itemSearch[i].getId(),
				});
			}
		}
		return data;
	} catch (error) {
		nlapiLogExecution('Error','Error : In Get Item Componets',error);
		return [];
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
				/* new nlobjSearchColumn("itemid").setSort(false), 
				new nlobjSearchColumn("displayname"), 
				new nlobjSearchColumn("type"),
				new nlobjSearchColumn("lastpurchaseprice"), */

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