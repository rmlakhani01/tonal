/**
* Copyright (c) 2022, Oracle and/or its affiliates.
* 500 Oracle Parkway Redwood Shores, CA 94065
* All Rights Reserved.
*
* This software is the confidential and proprietary information of
* NetSuite, Inc. ("Confidential Information"). You shall not
* disclose such Confidential Information and shall use it only in
* accordance with the terms of the license agreement you entered into
* with NetSuite.
*
* @NApiVersion 2.0
* @NScriptType MapReduceScript
* @NModuleScope Public
*
* Version    Date          Author        Remarks
* 1.00       [date]        [User]        Initial Commit
*
*/

define(['N/runtime' , 'N/search' , 'N/record' , 'N/transaction'], function (runtime , search , record , transaction) {


    /**
     *
     * Marks the beginning of the script’s execution. The purpose of the input stage is to generate the input data.
     * Executes when the getInputData entry point is triggered. This entry point is required.
     *
     * @param inputContext = { isRestarted: boolean, ObjectRef: { id: [string | number], type: string} }
     * @returns {Array | Object | search.Search | inputContext.ObjectRef | file.File Object}
     */
    function getInputData(inputContext) {

        log.debug("START GET INPUT DATA");
        try {
            //Get the search ID param
            var scriptObj = runtime.getCurrentScript();
            var searchId = scriptObj.getParameter('custscript_search_id');

            var searchResult = search.load({
                id: searchId
            });

            return searchResult

        } catch (ex) {
            log.error("GET INPUT DATA ERROR", ex)
        }
    }


    /**
     *
     * Executes when the map entry point is triggered.
     * The logic in your map function is applied to each key/value pair that is provided by the getInputData stage.
     * One key/value pair is processed per function invocation, then the function is invoked again for the next pair.
     * The output of the map stage is another set of key/value pairs. During the shuffle stage that always follows,
     * these pairs are automatically grouped by key.
     *
     * @param mapContext = { isRestarted: boolean, executionNo: property, errors: iterator, key: string, value: string }
     */
    function map(mapContext) {

        var title = "map";

        try {
            log.debug(title, "---- START ----");

            // Getting Values of a Saved Search with Summary / Group / Count Function

            var result = JSON.parse(mapContext.value).values;

            log.debug(title, "result: " + result);

            var internalid = result.internalid.value;
            
            log.debug(title, "internalid: " + internalid);

            var itemReciptData = {
                internalid: internalid
            };

            mapContext.write({
                key: internalid,
                value: itemReciptData
            });

        }
        catch (e) {
            log.error({
                title: '++++++++ERROR MAP+++++++',
                details: JSON.stringify(e)
            });
        }
    }


    /**
     *
     * Executes when the reduce entry point is triggered.
     * The logic in your reduce function is applied to each key, and its corresponding list of value.
     * Only one key, with its corresponding values, is processed per function invocation.
     * The function is invoked again for the next key and corresponding set of values.
     * Data is provided to the reduce stage by one of the following:
     *  - The getInputData stage — if your script has no map function.
     *  - The shuffle stage — if your script uses a map function. The shuffle stage follows the map stage.
     *    Its purpose is to sort data from the map stage by key.
     *
     * @param reduceContext = { isRestarted: boolean, executionNo: property, errors: iterator, key: string, value: string }
     */
    function reduce(reduceContext) {

        var title = 'reduce';

        try {

            var values = reduceContext.values.map(JSON.parse);

            var internalid = values[0].internalid;

            // var journalEntryRec = record.load({
            //     type: record.Type.JOURNAL_ENTRY,
            //     id: internalid,
            //     isDynamic: false,
            // });

            // var new_invoice_record = record.copy({ //create the new invoice
            //     type: transaction.Type.JOURNAL_ENTRY,
            //     id: internalid
            // });

            // var new_invoice_id = new_invoice_record.save({
            //     ignoreMandatoryFields:true,
            //     enablesourcing:true
            // });

            // log.audit("New Invoice created", new_invoice_id);

            // log.audit("DELETING INVOICE",internalid);
            // record.delete({ //delete the invoice 
            //     type: transaction.Type.JOURNAL_ENTRY,
            //     id: internalid
            // });

        } catch (e) {
            log.error({
                title: '++++++++ERROR REDUCE+++++++',
                details: JSON.stringify(e)
            });
        }
    }


    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce
    }
});