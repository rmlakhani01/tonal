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
* @NScriptType WorkflowActionScript
* @NModuleScope Public
*
*  Version    Date          Author              Remarks
*  1.00       4/21/22       Matteo Balduccio    Initial Commit - Case 4246730
*
*/

define(['N/search', 'N/runtime'], function (search, runtime) {


   /**
    *
    * Workflow action scripts allow you to create custom Workflow Actions that are defined on a record in a workflow.
    * Workflow action scripts are useful for performing actions on sublists because sublist fields are not currently
    * available through the Workflow Manager. Workflow action scripts are also useful when you need to create custom
    * actions that execute complex computational logic that is beyond what can be implemented with the built-in actions.
    *
    * @param scriptContext = { newRecord: record.Record, newRecord: record.Record, form: serverWidget.Form, type: string: workflowId: integer }
    */
   function onAction(scriptContext) {

      var stLogTitle = 'onAction';
      log.debug(stLogTitle, '---- START ----');

      try {

         var nextApprover = '';
         var record = scriptContext.newRecord;
         var subsidiary = record.getValue({ fieldId: 'subsidiary' });
         var accountArray = new Array();

         var numLines = record.getLineCount({
            sublistId: 'line'
         });

         for (var index = 0; index < numLines; index++) {

            //By client requirement it is defined to use the account of the first line
            var account = record.getSublistValue({
               sublistId: 'line',
               fieldId: 'account',
               line: index
            });

            if (!inArray(account,accountArray)) {

               accountArray.push(account);

               var customrecord_acs_je_approversSearchObj = search.create({
                  type: "customrecord_acs_je_approvers",
                  filters:
                     [
                        ["custrecord_acs_je_approve_account", "anyof", account],
                        "AND",
                        ["custrecord_acs_je_approve_sub", "anyof", subsidiary]
                     ],
                  columns:
                     [
                        search.createColumn({
                           name: "scriptid",
                           sort: search.Sort.ASC,
                           label: "Script ID"
                        }),
                        search.createColumn({ name: "custrecord_acs_je_approve_sub", label: "Subsidiary" }),
                        search.createColumn({ name: "custrecord_acs_je_approve_account", label: "JE Account" }),
                        search.createColumn({ name: "custrecord_acs_je_approve_approver", label: "JE Approver" })
                     ]
               });

               customrecord_acs_je_approversSearchObj.run().each(function (result) {

                  nextApprover = result.getValue({ name: 'custrecord_acs_je_approve_approver' });
                  return nextApprover;

               });

            }

            if (!isEmpty(nextApprover) || index == numLines - 1) {
               break;
            };

         }

         if (isEmpty(nextApprover)) {

            //In case no approver is found in Custom Record set default approver
            var script = runtime.getCurrentScript();
            var defaultapprover = script.getParameter('custscript_defaultapprover');
            nextApprover = defaultapprover

         };

         return nextApprover;

      } catch (e) {
         log.error(stLogTitle, 'error: ' + e.message);
      }
   }

   function isEmpty(stValue) {
      return (stValue === '' || stValue == null || stValue == undefined) || (stValue.constructor === Array && stValue.length == 0) ||
         (stValue.constructor === Object && (function (v) { for (var k in v) return false; return true; })(stValue));
   }

   function inArray(val,array) {
			
      if (array && array.length > 0) {
         for (var i=0;i<array.length;i++) {
            var currVal = array[i];
            if (val == currVal) return true;
         }
      }
      return false;
   }

   return {
      onAction: onAction
   }
});