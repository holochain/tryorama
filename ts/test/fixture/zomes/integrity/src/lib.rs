use hdi::prelude::*;

#[hdk_entry_helper]
#[derive(Clone)]
pub struct Content(pub String);

#[hdk_entry_helper]
pub struct UpdateInput {
    pub hash: ActionHash,
    pub content: String,
}

#[hdk_entry_types]
#[unit_enum(EntryTypesUnit)]
pub enum EntryTypes {
    Content(Content),
}
