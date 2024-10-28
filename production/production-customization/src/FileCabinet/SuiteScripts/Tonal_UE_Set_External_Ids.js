/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************
 * File Header
 * Script Type : User Event Script
 * Script Name : Tonal UE Set External Ids
 * File Name   : Tonal_UE_Set_External_Ids.js
 * Description : This script is used for set the external idsonrecord
 * Created On  : 19/12/2022
 * Modification Details:  
 ************************************************************/
define(["N/record"], function(record) {

    function setExternalId(context) {
        try {
            if(context.type == 'edit' || context.type == 'create'){
                var rectype = context.newRecord.type;
                log.debug('rectype',rectype);
                if(rectype == 'location'){
                    var recordObj = record.load({
                        type: context.newRecord.type,
                        id:context.newRecord.id,
                        isDynamic: true
                    });
                    var externalIdSource = recordObj.getValue('custrecord_external_id_source');
                    var externalId = recordObj.getValue('externalid');
                    log.debug('externalId=='+externalId,'externalIdSource=='+externalIdSource+'||itemId=='+itemId);
                    if(externalIdSource){
                        recordObj.setValue('externalid',externalIdSource);
                        recordObj.setValue('custrecord_external_id_display',recordObj.getValue('externalid'));
                        var recId = recordObj.save();
                        log.debug('ExternalId Updated For Location',recId);
                    }
                }
                if(rectype == 'inventoryitem' || rectype == 'assemblyitem'){
                    var recordObj = record.load({
                        type: context.newRecord.type,
                        id:context.newRecord.id,
                        isDynamic: true
                    });
                    var externalIdSource = recordObj.getValue('custitem_externalidid_source');
                    var itemId = recordObj.getValue('itemid');
                    var externalId = recordObj.getValue('externalid');
                    log.debug('externalId=='+externalId,'externalIdSource=='+externalIdSource+'||itemId=='+itemId);
                    if(externalIdSource && itemId /*&& !externalId*/){
                        recordObj.setValue('externalid',externalIdSource/* +'_'+itemId */);
                        recordObj.setValue('custitem_external_id_display',recordObj.getValue('externalid'));
                        var recId = recordObj.save();
                        log.debug('ExternalId Updated For Item',recId);
                    }
                }
            }
        } catch (error) {
            log.error('Error : In Set ExternalId',error);
        }
    }

    return {
        afterSubmit: setExternalId
    }
});
