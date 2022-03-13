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
    let entry_hash = create_entry(input).unwrap();
    Ok(entry_hash)
}

#[hdk_extern]
pub fn read(hash: HeaderHash) -> ExternResult<Content> {
    let element = get(hash, GetOptions::default())?.unwrap();
    let input: Content = element.entry().to_app_option()?.unwrap();
    Ok(input)
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
