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
function ue_beforeLoad_changetracker(type, form, request) {

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
function ue_beforeSub_changetracker(type) {
	nlapiLogExecution('DEBUG', 'type', type);
	if (type == 'edit') {
		var changetracker = nlapiGetFieldValue('custbody_jaz_changetracker');
		nlapiLogExecution('DEBUG', 'changetracker', changetracker);
		if (changetracker) {
			changetracker = changetracker.split(',');
			var oldrec = nlapiGetOldRecord();
			var newrec = nlapiGetNewRecord();
			nlapiLogExecution('DEBUG', 'oldrec stringify', JSON.stringify(oldrec));
			nlapiLogExecution('DEBUG', 'newrec stringify', JSON.stringify(newrec));
			var latestmodification = '';
			var sublistmodif = '';

			for (var i = 0; i < changetracker.length; i++) {
				if (changetracker[i] == 'item' || changetracker[i] == 'expense') {
					if (sublistmodif == '') {
						sublistmodif = changetracker[i].toUpperCase();
					} else {
						sublistmodif = sublistmodif + '\n'
								+ changetracker[i].toUpperCase();
						;
					}
				} else {
					var fieldType = nlapiGetField(changetracker[i]).getType();
					if (fieldType == 'select') {
						var oldfieldvalue = oldrec
								.getFieldText(changetracker[i]);
						var newfieldvalue = newrec
								.getFieldText(changetracker[i]);
					} else {
						var oldfieldvalue = oldrec
								.getFieldValue(changetracker[i]);
						var newfieldvalue = newrec
								.getFieldValue(changetracker[i]);
					}
					if (oldfieldvalue == null)
						oldfieldvalue = '-Not Set-';
					if (newfieldvalue == null)
						newfieldvalue = '-Not Set-';

					if (oldfieldvalue != newfieldvalue) {
						var fieldlabel = nlapiGetField(changetracker[i])
								.getLabel();

						if (fieldlabel == '') {
							fieldlabel = changetracker[i];
						}
						if (latestmodification == '') {
							latestmodification = fieldlabel + '\nOld Value : '
									+ oldfieldvalue + '\nNew Value : '
									+ newfieldvalue;
						} else {
							latestmodification = latestmodification + '\n\n'
									+ fieldlabel + '\nOld Value : '
									+ oldfieldvalue + '\nNew Value : '
									+ newfieldvalue;
						}
					}
				}
			}

			if (sublistmodif) {
				latestmodification = latestmodification
						+ '\n\n Sublist Modified:\n' + sublistmodif;
			}
			nlapiLogExecution('AUDIT', 'latestmodification', latestmodification);
			if (nlapiGetFieldValue('custbody_jaz_for_reapproval') == 'F') {
				nlapiSetFieldValue('custbody_jaz_changetracker', '');
			}
			var audittrackerfield = nlapiGetFieldValue('custbody_jaz_audittracker');
			if (audittrackerfield) {
				nlapiSetFieldValue('custbody_jaz_audittracker',
						audittrackerfield + '\n\n---\n\n' + latestmodification);
			} else {
				nlapiSetFieldValue('custbody_jaz_audittracker',
						latestmodification);
			}
		}
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
