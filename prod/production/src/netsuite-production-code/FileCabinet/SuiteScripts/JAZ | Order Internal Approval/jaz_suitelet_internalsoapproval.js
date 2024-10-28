/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       23 Jul 2019     User
 *
 */

/**
 * @param {nlobjRequest} request Request object
 * @param {nlobjResponse} response Response object
 * @returns {Void} Any output is written via response object
 */
function interalSOApproval(request, response){
	var soId = request.getParameter('custparamsoid');
	var approvalId = request.getParameter('costparamappoval');
	
  	var rec = nlapiLoadRecord('salesorder', soId);
	var checked = rec.getFieldValue('custbody_jaz_approvedbydepthead');
	var closed = rec.getFieldValue('orderstatus');
  
  	var soNo = rec.getFieldValue('tranid');
  	var total = rec.getFieldValue('total');
  
	if (checked == 'F' && closed == 'A') {
		if (approvalId == 'approve'){
			nlapiTriggerWorkflow('salesorder', soId, 'customworkflow_jaz_internalorders', 'workflowaction35');
			response.write('Internal use Sales Order ' + soNo.substring(2) + ' for $' + total + ' has been approved and will go to Finance for final approval.');
		} else if (approvalId == 'reject'){
			nlapiTriggerWorkflow('salesorder', soId, 'customworkflow_jaz_internalorders', 'workflowaction36');
			response.write('Internal use Sales Order ' + soNo.substring(2) + ' for $' + total + ' has been rejected, the original requestor has been notified.');
		} else {
			response.write('An error has occurred.');
		}
	} else if (checked == 'T' || closed !== 'A'){
		response.write('The Sales Order has been either approved or rejected already.');
	} else {
      	response.write('An error has occurred.');
    }
}
