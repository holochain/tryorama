use hdk::prelude::*;
use integrity::{Content, EntryTypes, EntryTypesUnit, UpdateInput};

#[derive(Serialize, Deserialize, Debug, Clone, SerializedBytes)]
pub struct Payload {
    content: Content,
    hash: ActionHash,
}

#[hdk_extern]
pub fn create_and_delete(input: Payload) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::Content(input.content))?;
    delete_link(input.hash)?;
    Ok(action_hash)
}

#[hdk_extern]
pub fn query_content(_: ()) -> ExternResult<Vec<Content>> {
    let filter = ChainQueryFilter::new()
        .include_entries(true)
        .action_type(ActionType::Create)
        .entry_type(EntryTypesUnit::Content.try_into()?);

    let result = query(filter)?;

    Ok(result
        .into_iter()
        .filter_map(|r| r.try_into().ok())
        .collect())
}

#[hdk_extern]
pub fn create(input: Content) -> ExternResult<ActionHash> {
    let action_hash = create_entry(EntryTypes::Content(input))?;
    Ok(action_hash)
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
    let updated_hash = update_entry(input.hash, EntryTypes::Content(Content(input.content)))?;
    Ok(updated_hash)
}

#[hdk_extern]
pub fn delete(hash: ActionHash) -> ExternResult<ActionHash> {
    let deleted_hash = delete_entry(hash)?;
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

// #[hdk_extern]
// fn create_two_party_countersigning_session(
//     with_other: AgentPubKey,
// ) -> ExternResult<PreflightResponse> {
//     let my_agent_info = agent_info()?;

//     let entry = Content("hello".to_string());

//     let entry_hash = hash_entry(EntryTypes::Content(entry.clone()))?;

//     let session_times = session_times_from_millis(10_000)?;
//     let request = PreflightRequest::try_new(
//         entry_hash,
//         vec![
//             (my_agent_info.agent_initial_pubkey, vec![]),
//             (with_other.clone(), vec![]),
//         ],
//         Vec::with_capacity(0),
//         0,
//         true,
//         session_times,
//         ActionBase::Create(CreateBase::new(EntryTypesUnit::Content.try_into()?)),
//         PreflightBytes(vec![]),
//     )
//     .map_err(|e| {
//         wasm_error!(WasmErrorInner::Guest(format!(
//             "Failed to create countersigning request: {:?}",
//             e
//         )))
//     })?;

//     // Accept ours now and then Holochain should wait for the other party to join the session
//     let my_acceptance = accept_countersigning_preflight_request(request.clone())?;

//     let response = match &my_acceptance {
//         PreflightRequestAcceptance::Accepted(response) => response.clone(),
//         e => {
//             return Err(wasm_error!(WasmErrorInner::Guest(format!(
//                 "Unexpected response: {:?}",
//                 e
//             ))))
//         }
//     };

//     Ok(response)
// }

// #[hdk_extern]
// fn accept_two_party(request: PreflightRequest) -> ExternResult<PreflightResponse> {
//     let my_accept = accept_countersigning_preflight_request(request)?;
//     match my_accept {
//         PreflightRequestAcceptance::Accepted(response) => Ok(response),
//         e => Err(wasm_error!(WasmErrorInner::Guest(format!(
//             "Unexpected response: {:?}",
//             e
//         )))),
//     }
// }

// #[hdk_extern]
// fn commit_two_party(responses: Vec<PreflightResponse>) -> ExternResult<()> {
//     let inner = Content("hello".to_string());

//     let entry = Entry::CounterSign(
//         Box::new(
//             CounterSigningSessionData::try_from_responses(responses, vec![]).map_err(
//                 |countersigning_error| {
//                     wasm_error!(WasmErrorInner::Guest(countersigning_error.to_string()))
//                 },
//             )?,
//         ),
//         inner.clone().try_into()?,
//     );

//     let agreement = EntryTypes::Content(inner);
//     let entry_def_index = ScopedEntryDefIndex::try_from(&agreement)?;
//     let visibility = EntryVisibility::from(&agreement);

//     hdk::prelude::create(CreateInput::new(
//         entry_def_index,
//         visibility,
//         entry,
//         // Countersigned entries MUST have strict ordering.
//         ChainTopOrdering::Strict,
//     ))?;

//     Ok(())
// }
