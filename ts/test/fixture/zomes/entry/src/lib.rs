use hdk::prelude::*;

entry_defs![Content::entry_def()];

#[hdk_entry(id = "Content")]
pub struct Content(String);

#[derive(Serialize, Deserialize, SerializedBytes, Debug, Clone)]
pub struct UpdateInput {
    pub hash: HeaderHash,
    pub content: String,
}

#[hdk_extern]
pub fn create(input: Content) -> ExternResult<HeaderHash> {
    let header_hash = create_entry(input).unwrap();
    Ok(header_hash)
}

#[hdk_extern]
pub fn read(hash: HeaderHash) -> ExternResult<Option<Content>> {
    let entry: Option<Content> = match get(hash, GetOptions::default())? {
        Some(element) => Some(element.entry().to_app_option::<Content>()?.unwrap()),
        None => None
    };
    Ok(entry)
}

#[hdk_extern]
pub fn update(input: UpdateInput) -> ExternResult<HeaderHash> {
    let updated_hash = update_entry(input.hash, Content(input.content)).unwrap();
    Ok(updated_hash)
}

#[hdk_extern]
pub fn delete(hash: HeaderHash) -> ExternResult<HeaderHash> {
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
