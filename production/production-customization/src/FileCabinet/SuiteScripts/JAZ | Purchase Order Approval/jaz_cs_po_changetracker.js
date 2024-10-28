/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       10 May 2019     User
 *
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your
 * script deployment.
 * 
 * @appliedtorecord recordType
 * 
 * @param {String}
 *            type Sublist internal id
 * @param {String}
 *            name Field internal id
 * @param {Number}
 *            linenum Optional line item number, starts from 1
 * @returns {Boolean} True to continue changing field value, false to abort
 *          value change
 */
function po_approval_validateField(type, name, linenum) {
	debugger;
	var fieldChangeId = '';
	if (type != '' && type != null) { // if editing a sublist
		fieldChangeId = type;

	} else {
		fieldChangeId = name;
	}
	if (name != 'custbody_jaz_changetracker' && name != 'approvalstatus' && name != 'custbody_jaz_for_reapproval'
			&& name != null) {
		var changetracker = nlapiGetFieldValue('custbody_jaz_changetracker');

		if (changetracker == '') {
			nlapiSetFieldValue('custbody_jaz_changetracker', fieldChangeId,
					false);
		} else {
			nlapiSetFieldValue('custbody_jaz_changetracker', changetracker
					+ ',' + fieldChangeId, false);
		}
	}
	return true;
}

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your
 * script deployment.
 * 
 * @appliedtorecord recordType
 * 
 * @returns {Boolean} True to continue save, false to abort save
 */
function po_changetracker_saveRecord() {
	var changetracker = nlapiGetFieldValue('custbody_jaz_changetracker');
	changetracker_unique = changetracker.split(',');
	changetracker_unique = changetracker_unique.unique();
	nlapiSetFieldValue('custbody_jaz_changetracker', changetracker_unique
			.toString(), false);
	return true;
}

Array.prototype.contains = function(v) {
	for (var i = 0; i < this.length; i++) {
		if (this[i] === v)
			return true;
	}
	return false;
};

Array.prototype.unique = function() {
	var arr = [];
	for (var i = 0; i < this.length; i++) {
		if (!arr.includes(this[i])) {
			arr.push(this[i]);
		}
	}
	return arr;
}