/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       14 May 2019     User
 *
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your
 * script deployment.
 * 
 * @appliedtorecord recordType
 * 
 * @param {String}
 *            type Operation types: create, edit, view, copy, print, email
 * @param {nlobjForm}
 *            form Current form
 * @param {nlobjRequest}
 *            request Request object
 * @returns {Void}
 */
function userEventBeforeLoad(type, form, request) {

}

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your
 * script deployment.
 * 
 * @appliedtorecord recordType
 * 
 * @param {String}
 *            type Operation types: create, edit, delete, xedit approve, reject,
 *            cancel (SO, ER, Time Bill, PO & RMA only) pack, ship (IF)
 *            markcomplete (Call, Task) reassign (Case) editforecast (Opp,
 *            Estimate)
 * @returns {Void}
 */
function ue_beforeSubmit_itemtracker(type) {
	if (type == 'edit') {
		var changetracker = nlapiGetFieldValue('custbody_jaz_changetracker');
		nlapiLogExecution('DEBUG', 'changetracker', changetracker);
		var oldrec = nlapiGetOldRecord();
		var newrec = nlapiGetNewRecord();
		var allchanges = '';
		var oldreclineitems = '';
		var newreclineitems = '';

		var oldrectotal = oldrec.getFieldValue('total');
		var newrectotal = newrec.getFieldValue('total');
		var lineitemchanged = false;
		if (changetracker) {
			changetracker = changetracker.split(',');

			for (var i = 0; i < changetracker.length; i++) {
				if (changetracker[i] == 'item') {
					lineitemchanged = true;

					if (oldrectotal != newrectotal) {
						allchanges += 'Total has changed from ' + oldrectotal
								+ ' to ' + newrectotal + '\n\n';
					}
					// old rec line items
					for (var i = 1; i <= oldrec.getLineItemCount('item'); i++) {
						var oldrecitem = oldrec.getLineItemText('item', 'item',
								i);
						var oldrecqty = oldrec.getLineItemValue('item',
								'quantity', i);
						oldreclineitems += oldrecqty + ' ' + oldrecitem + '\n';
					}
					for (var i = 1; i <= newrec.getLineItemCount('item'); i++) {
						var newrecitem = newrec.getLineItemText('item', 'item',
								i);
						var newrecqty = newrec.getLineItemValue('item',
								'quantity', i);
						newreclineitems += newrecqty + ' ' + newrecitem + '\n';

					}
					allchanges += '\nPrevious Line Item\n' + oldreclineitems;
					allchanges += '\n\nNew Line Item\n' + newreclineitems;
				}
			}
		}
		if (lineitemchanged == false){
			allchanges += '\nNo changes on the Line Items.'
		}
		nlapiSetFieldValue('custbody_jaz_audittracker', allchanges);
	}
}

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your
 * script deployment.
 * 
 * @appliedtorecord recordType
 * 
 * @param {String}
 *            type Operation types: create, edit, delete, xedit, approve,
 *            cancel, reject (SO, ER, Time Bill, PO & RMA only) pack, ship (IF
 *            only) dropship, specialorder, orderitems (PO only) paybills
 *            (vendor payments)
 * @returns {Void}
 */
function userEventAfterSubmit(type) {

}
