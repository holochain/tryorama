use hdk::prelude::*;

#[derive(Serialize, Deserialize, SerializedBytes, Debug, Clone)]
pub struct Input {
    pub content: String,
}

#[derive(Serialize, Deserialize, SerializedBytes, Debug, Clone)]
pub struct UpdateInput {
    pub hash: HeaderHash,
    pub content: String,
}

#[hdk_entry(id = "foo")]
pub struct TestEntry(String);

entry_defs![TestEntry::entry_def()];

#[hdk_extern]
pub fn create(input: Input) -> ExternResult<HeaderHash> {
    let entry_hash = create_entry(TestEntry(input.content)).unwrap();
    Ok(entry_hash)
}

#[hdk_extern]
pub fn read(hash: HeaderHash) -> ExternResult<Element> {
    let entry = get(hash, GetOptions::default())?.unwrap();
    Ok(entry)
}

#[hdk_extern]
pub fn update(input: UpdateInput) -> ExternResult<HeaderHash> {
    let updated_hash = update_entry(input.hash, TestEntry(input.content)).unwrap();
    Ok(updated_hash)
}

#[hdk_extern]
pub fn delete(hash: HeaderHash) -> ExternResult<HeaderHash> {
    let deleted_hash = delete_entry(hash).unwrap();
    Ok(deleted_hash)
}
