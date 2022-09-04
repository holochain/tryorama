use hdi::prelude::*;

#[hdk_entry_helper]
pub struct Content(pub String);

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
