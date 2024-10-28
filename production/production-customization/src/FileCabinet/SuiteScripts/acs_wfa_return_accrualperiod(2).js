/**
 * @NScriptType workflowactionscript
 * @NAPIVersion 2.0
 *
 * Version    Date        Employee           Case #    Remarks
 * 1.00       2/3/2021    Gabriel Folstein   4446421   Uses the name of the Accounting Period to find the corresponding Accrual-Accounting-Period record
 */

define(['N/record', 'N/search', 'N/log'],

	function (record, search, log) {

		function accrualPeriod(context) {
			var accrualId  = null;
			try {
				var currRec = context.newRecord;
				var rec = currRec.id;
				var period = currRec.getText('postingperiod');
				log.debug('Posting Period',period);
				var accrualSearchResult = search.create({
					type: "customrecord_cseg2",
					filters:
					[
						["name","is", period]
					],
					columns:
					[
						search.createColumn("internalid")
					]
				}).run().getRange(0,1);
				accrualId = accrualSearchResult[0].getValue('internalid');
				log.debug('result',accrualId);
			} catch (e) {
				//Do nothing will return null;
			}
			return accrualId;
		}
		
		return {
		  onAction: accrualPeriod
		}
	}
);