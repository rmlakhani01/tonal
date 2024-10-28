/*************************************************************
* File Header
* Script Type: Custom GL
* Script Name: GL Plugin IF/IR Based On Location
* File Name  : GL_Plugin_IF_IR_Based_On_Location.js 
* Created On : 19/08/2022
* Modified On: 
* Created By : Vikash Kumar (Yantra Inc.)
* Modified By: 
* Description: This is used for hit the COGS account for credit and debit based on headr and line level location for IR and IF
************************************************************/
function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
	try {

		var tranType = transactionRecord.getRecordType();

		nlapiLogExecution('Debug','Transaction Type',tranType);

		//for transaction type itemfulfillment
		if(tranType == 'itemfulfillment'){

			var location = transactionRecord.getFieldValue('custbody_sales_order_location');

			// var ordertype = transactionRecord.getFieldValue('custbody_jaz_ordertype');

			//get the line location for the item which is at index Zero
			var lineLocation = transactionRecord.getLineItemValue('item','location',1);

			nlapiLogExecution('DEBUG', 'Location||'+location, 'Order Type||||Line Location||'+lineLocation);

			//get the department from the sales order record
			var salesDep = nlapiLookupField('salesorder',transactionRecord.getFieldValue('createdfrom'),'department');

			nlapiLogExecution('DEBUG','SALES DEP',salesDep);

			if(/* ordertype == 3 && */ location){
				// nlapiLogExecution('DEBUG', 'standardLines.getCount()', standardLines.getCount());
				for (var i = 0; i < standardLines.getCount(); i++){
					var debitAmount = standardLines.getLine(i).getDebitAmount();
					var standardAccount = standardLines.getLine(i).getAccountId();
					// nlapiLogExecution('DEBUG', 'Debit Amount', debitAmount);
					// nlapiLogExecution('DEBUG', 'Account', standardAccount);
					
					if (standardAccount && debitAmount != 0){
						//add credit account as COGS
						if (debitAmount != 0){
							var newLineCredit = customLines.addNewLine();
							newLineCredit.setAccountId(standardAccount); 
							newLineCredit.setCreditAmount(debitAmount);
							newLineCredit.setLocationId(Number(lineLocation));
							newLineCredit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
							newLineCredit.setDepartmentId(Number(salesDep));
							newLineCredit.setMemo('COGS - Credit');
						}
						//add debit account as COGS
						if (debitAmount != 0){ 
							var newLineDebit = customLines.addNewLine();
							newLineDebit.setAccountId(standardAccount);
							newLineDebit.setDebitAmount(debitAmount);
							newLineDebit.setLocationId(Number(location));
							newLineDebit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
							newLineDebit.setDepartmentId(Number(salesDep));
							newLineDebit.setMemo('COGS - Debit');
						}
					}
				}
			}
			else{
				nlapiLogExecution('DEBUG','NO GL LINE ADDED','LOCTION OR ORDERTYPE DIFFERENT');
			}
		}

		//for transaction type item receipt
		if(tranType == 'itemreceipt'){

			var location = transactionRecord.getFieldValue('custbody_sales_order_location');

			//get the line location for the item which is at index Zero
			var lineLocation = transactionRecord.getLineItemValue('item','location',1);

			nlapiLogExecution('DEBUG', 'Location||'+location, 'Line Location||'+lineLocation);

			//get the department from the return authorization record
			var salesDep = nlapiLookupField('returnauthorization',transactionRecord.getFieldValue('createdfrom'),'department');

			if(location){
				for (var i = 0; i < standardLines.getCount(); i++){
					var creditAmount = standardLines.getLine(i).getCreditAmount();
					var standardAccount = standardLines.getLine(i).getAccountId();
					// nlapiLogExecution('DEBUG', 'Credit Amount', creditAmount);
					// nlapiLogExecution('DEBUG', 'Account', standardAccount);
					
					if (standardAccount && creditAmount != 0){
						//add credit account as COGS
						if (creditAmount != 0){
							var newLineCredit = customLines.addNewLine();
							newLineCredit.setAccountId(standardAccount); 
							newLineCredit.setCreditAmount(creditAmount);
							newLineCredit.setLocationId(Number(location));
							newLineCredit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
							newLineCredit.setDepartmentId(Number(salesDep));
							newLineCredit.setMemo('COGS - Credit');
						}
						//add debit account as COGS
						if (creditAmount != 0){ 
							var newLineDebit = customLines.addNewLine();
							newLineDebit.setAccountId(standardAccount);
							newLineDebit.setDebitAmount(creditAmount);
							newLineDebit.setLocationId(Number(lineLocation));
							newLineDebit.setEntityId(Number(transactionRecord.getFieldValue('entity')));
							newLineDebit.setDepartmentId(Number(salesDep));
							newLineDebit.setMemo('COGS - Debit');
						}
					}
				}
			}
			else{
				nlapiLogExecution('DEBUG','NO GL LINE ADDED','LOCTION NOT AVILABLE ON TRANSACTION');
			}

		}
	} catch (error) {
		nlapiLogExecution('ERROR','MAIN GL EXCEPTION',error);
	}
}