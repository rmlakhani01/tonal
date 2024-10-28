/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/task', 'N/file', 'N/record'],

function(task, file, record) {
    function afterSubmit(context) {
        var nrec = context.newRecord;
        if (nrec.getValue({fieldId:'custrecord_tnl_assembly_import_err_repro'})){
            if (nrec.getValue({fieldId:'custrecord_tnl_assembly_import_err_file'})){
                // The Re-Process Flag Is Checked And We Have A File
                var csvDoc = file.load({id: nrec.getValue({fieldId:'custrecord_tnl_assembly_import_err_file'})});

                // Move File To Pending Folder
                // csvDoc.folder = 408; // SB
                csvDoc.folder = 439; // PROD
                csvDoc.save();

                var mrScriptTask = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: 'customscript_tnl_assembly_file_proc',
                    deploymentId: 'customdeploy_tnl_assembly_file_proc_1',
                });
                mrScriptTask.submit();
            }
        }
        record.submitFields({
            type:'customrecord_tnl_assembly_import_err',
            id: nrec.id,
            values: {
                custrecord_tnl_assembly_import_err_repro: false
            }
        });
    }

    return {
        afterSubmit: afterSubmit
    };
    
});
