/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       30 Jul 2019     User
 *
 */

/**
 * @returns {Void} Any or no return value
 */
function workflowAction_closeSO() {
	var soid = nlapiGetContext().getSetting('SCRIPT',
			'custscript_jaz_wfa_close_so_reject_soid');
  	nlapiLogExecution('DEBUG','soid',soid);
	var rec = nlapiLoadRecord('salesorder', soid, {recordmode : 'dynamic'});

	for (var i = 1; i <= rec.getLineItemCount('item'); i++) {
		rec.setLineItemValue('item','isclosed', i, 'T');
	}
	var memo = rec.getFieldValue('memo');
	if (memo){
		rec.setFieldValue('memo', memo + ' | Rejected Internal SO');
	} else {
		rec.setFieldValue('memo', 'Rejected Internal SO');

	}
	
	nlapiSubmitRecord(rec);
}
