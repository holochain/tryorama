use hdk::prelude::*;

#[hdk_entry_helper]
pub struct Content(String);

#[hdk_entry_helper]
pub struct UpdateInput {
    pub hash: ActionHash,
    pub content: String,
}

#[hdk_entry_defs]
#[unit_enum(EntryTypesUnit)]
pub enum EntryTypes {
    Content(Content),
}

#[hdk_extern]
pub fn create(input: Content) -> ExternResult<ActionHash> {
    let header_hash = create_entry(EntryTypes::Content(input)).unwrap();
    Ok(header_hash)
}

#[hdk_extern]
pub fn read(hash: ActionHash) -> ExternResult<Option<Content>> {
    let entry = match get(hash, GetOptions::default())? {
        Some(record) => record
            .entry()
            .to_app_option::<Content>()
            .map_err(|err| wasm_error!(WasmErrorInner::Guest(err.to_string())))?,
        None => None,
    };
    Ok(entry)
}

#[hdk_extern]
pub fn update(input: UpdateInput) -> ExternResult<ActionHash> {
    let updated_hash =
        update_entry(input.hash, EntryTypes::Content(Content(input.content))).unwrap();
    Ok(updated_hash)
}

#[hdk_extern]
pub fn delete(hash: ActionHash) -> ExternResult<ActionHash> {
    let deleted_hash = delete_entry(hash).unwrap();
    Ok(deleted_hash)
}

#[derive(Serialize, Deserialize, SerializedBytes, Debug)]
pub struct LoopBack {
    value: String,
}

#[hdk_extern]
fn signal_loopback(value: LoopBack) -> ExternResult<()> {
    emit_signal(&value)?;
    Ok(())
}
