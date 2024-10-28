/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal CS Set Default Items
 * File Name   : Tonal_CS_Set_Default_Items.js
 * Description : This script is used for setting default items on IA
 * Created On  : 25/05/2023
 * Modification Details:  
 ************************************************************/
define(["N/search","N/currentRecord","N/runtime"], function(search,currentRecord,runtime) {

    const pageInit = async (context) => {
        try {
            let scriptObj = runtime.getCurrentScript();
            let itemSearchId = scriptObj.getParameter('custscript_defualt_item_data');
            let customForm = scriptObj.getParameter('custscript_custom_form');
            let subsidiary = scriptObj.getParameter('custscript_sub');
            if(!itemSearchId || !customForm || !subsidiary){
                log.debug('MISISNG_PARAMETER_FOR_DEFAULT_ITEM_SET',JSON.stringify({item_search:itemSearchId,custom_form:customForm,subsidiary:subsidiary}));
                return;
            }
            if(context.mode == 'create'){
                const record = currentRecord.get();
                let recordCustomForm = record.getValue('customform');
                if(customForm == recordCustomForm){
                    alert('Please wait. Items are loading...');
                    record.setValue('subsidiary',subsidiary);
                    // runs saved search asynchronously and returns an array of item ids
                    const itemIds = await getItems(itemSearchId);
                    for (let i = 0; i < itemIds.length; i++) {
                        record.selectNewLine({ sublistId: 'inventory' });
                        record.setCurrentSublistValue({
                            sublistId: 'inventory',
                            fieldId: 'item',
                            line: i,
                            value: itemIds[i],
                            forceSyncSourcing: true,
                        });
                        
                        record.setCurrentSublistValue({
                            sublistId: 'inventory',
                            fieldId: 'adjustqtyby',
                            line: i,
                            value: 1,
                            forceSyncSourcing: true,
                        });
                        record.commitLine({ sublistId: 'inventory' });
                    }
                }
            }
        } catch (error) {
            log.error('Error : In Set Default Items',error);
        }
    }

    //function to get the item details by loading the search
    const getItems = async (searchId) => {
        const items = [];
        await search.load.promise({
            type: search.Type.ITEM,
            id: searchId,
        }).then((result) => {
            result.run().each((item) => {
              items.push(item.id)
              return true
            });
        }).catch((error) => {
            if (error.name === 'INVALID_SEARCH') {
              alert(error.message);
            } else {
              log.debug('ERROR', JSON.stringify(error, null, 2));
            }
        });
    
        return items
    }

    const saveRecord = (context) =>{
        try {
            const record = context.currentRecord;
            let lineCount = record.getLineCount({
                sublistId: 'inventory'
            });
            alert('lineCount=='+lineCount);
            return true;
        } catch (error) {
            log.error('Error : In Save Record',error);
        }
    }

    return {
        pageInit: pageInit,
        // saveRecord: saveRecord
    }
});
