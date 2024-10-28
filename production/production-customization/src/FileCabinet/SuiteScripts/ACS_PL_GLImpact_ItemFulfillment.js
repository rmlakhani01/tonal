/**
 * Copyright (c) 1998-2021 NetSuite, Inc.
 * 2955 Campus Drive, Suite 100, San Mateo, CA, USA 94403-2511
 * All Rights Reserved.
 *
 * This software is the confidential and proprietary information of NetSuite, Inc. ("Confidential Information").
 * You shall not disclose such Confidential Information and shall use it only in accordance with the terms of the license agreement
 * you entered into with NetSuite.
 *
 *  Version	    Date			Author			Remarks
 *  1.00		23-Sep-2021     wsalinas        Initial version - Case #4308610
 *  1.01		27-Sep-2021     wsalinas        Added logic to convert 'T' and 'F' values on 'true' and 'false' at lineAppliesForCustomization().
 * 
 */

/**
 * Creates custom lines based on the item and location of each line of an Item Fulfillment record.
 * 
 * @param {record} transactionRecord 
 * @param {array} standardLines 
 * @param {array} customLines 
 * @param {accounting book} book 
 */
function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
    var stMethodName = 'customizeGLImpact()';
    nlapiLogExecution('DEBUG', stMethodName, '* * * S t a r t * * *');
    try {
        var resultSet = getGLLinesMapping();
        var numItems = transactionRecord.getLineItemCount('item');

        for (var i = 1; i <= numItems; i++) {
            var item = transactionRecord.getLineItemValue('item', 'item', i);
            var location = transactionRecord.getLineItemValue('item', 'location', i);
            var entity = transactionRecord.getFieldValue('entity');

            var bLineAppliesForCustomization = lineAppliesForCustomization(item);
            if (bLineAppliesForCustomization) {

                var quantity = transactionRecord.getLineItemValue('item', 'quantity', i); // Per unit basis
                for (var j = 0; j < quantity; j++) {

                    resultSet.forEachResult(function (searchResult) {
                        var mapDebitAccount = searchResult.getValue('custrecord_acs_debit_account');
                        var mapCreditAccount = searchResult.getValue('custrecord_acs_credit_account');
                        var mapAmount = searchResult.getValue('custrecord_acs_amount');
                        var mapLocation = searchResult.getValue('custrecord_acs_location');

                        var objLineData = {
                            entity: entity,
                            debitAccount: mapDebitAccount,
                            creditAccount: mapCreditAccount,
                            amount: mapAmount,
                            location: mapLocation
                        }

                        if (mapLocation == location) {
                            createCustomLines(customLines, objLineData);
                        }

                        return true;
                    });
                }
            }
        }

    } catch (error) {
        nlapiLogExecution('ERROR', stMethodName, 'ERROR : ' + error.message);
    } finally {
        nlapiLogExecution('DEBUG', stMethodName, '* * * E n d * * *');
    }
}

/**
 * Gets the mapping records that provide the data to create the custom lines.
 * 
 * @returns a search result set. 
 */
function getGLLinesMapping() {
    var stMethodName = 'getGLLinesMapping()';
    try {
        var columns = new Array();
        columns[0] = new nlobjSearchColumn("internalid");
        columns[1] = new nlobjSearchColumn("custrecord_acs_debit_account");
        columns[2] = new nlobjSearchColumn("custrecord_acs_credit_account");
        columns[3] = new nlobjSearchColumn("custrecord_acs_amount");
        columns[4] = new nlobjSearchColumn("custrecord_acs_location");

        var search = nlapiCreateSearch('customrecord_acs_glimpact_acc_mapping', null, columns);
        return resultSet = search.runSearch();

    } catch (error) {
        nlapiLogExecution('ERROR', stMethodName, 'ERROR : ' + error.message);
    }
}

/**
 * Checks whether the item of each line of the Item Fulfillment record applies
 * for the customization.
 * 
 * @param {internalid} itemId 
 * @returns true if item applies. 
 */
function lineAppliesForCustomization(itemId) {
    var stMethodName = 'lineAppliesForCustomization()';
    try {
        var itemApplies = nlapiLookupField('item', itemId, 'custitem_acs_add_item_capture_acc_cos');
        var bItemApplies = (itemApplies == 'T') ? true : false;
        return bItemApplies;

    } catch (error) {
        nlapiLogExecution('ERROR', stMethodName, 'ERROR : ' + error.message);
    }
}

/**
 * Creates the custom lines.
 */
function createCustomLines(customLines, objLineData) {
    var stMethodName = 'createCustomLines()';
    try {
        var debitLine = customLines.addNewLine();
        debitLine.setAccountId(parseInt(objLineData.debitAccount));
        debitLine.setDebitAmount(parseFloat(objLineData.amount));
        debitLine.setEntityId(parseInt(objLineData.entity));
        debitLine.setLocationId(parseInt(objLineData.location));

        var creditLine = customLines.addNewLine();
        creditLine.setAccountId(parseInt(objLineData.creditAccount));
        creditLine.setCreditAmount(parseFloat(objLineData.amount));
        creditLine.setEntityId(parseInt(objLineData.entity));
        creditLine.setLocationId(parseInt(objLineData.location));

    } catch (error) {
        nlapiLogExecution('ERROR', stMethodName, 'ERROR : ' + error.message);
    }
}

/**
 * Checks whether the value passed is empty.
 * 
 * @param {*} stValue 
 * @returns true if value is empty. 
 */
function isEmpty(stValue) {
    if ((stValue == '') || (stValue == null) || (stValue == undefined)) {
        return true;
    }
    return false;
}

