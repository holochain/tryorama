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

// #[derive(Serialize, Deserialize, SerializedBytes, Debug, Clone)]
// pub struct GrantInput {
//     pub grantee: AgentPubKey,
//     pub entry_hash: HeaderHash,
// }

#[hdk_extern]
pub fn get_cap_secret(grantee: AgentPubKey) -> ExternResult<CapSecret> {
    let mut granted_fns = BTreeSet::<GrantedFunction>::new();
    granted_fns.insert((zome_info()?.name, "read".into()));
    let _cap_grant_hh = create_cap_grant(CapGrantEntry {
        tag: "grant_all".into(),
        access: CapAccess::Unrestricted,
        functions: granted_fns,
    })?;
    let cap_secret = generate_cap_secret()?;
    call_remote(
        grantee,
        zome_info()?.name,
        "read".into(),
        None,
        ClaimInput {
            grantor: agent_info()?.agent_latest_pubkey,
            secret: cap_secret,
        },
    )?;
    Ok(cap_secret)
}

#[derive(Serialize, Deserialize, SerializedBytes, Debug, Clone)]
pub struct ClaimInput {
    pub grantor: AgentPubKey,
    pub secret: CapSecret,
}

#[hdk_extern]
pub fn commit_cap_claim(claim_unrestricted_access_input: ClaimInput) -> ExternResult<()> {
    let _create_cap_claim_hh = create_cap_claim(CapClaim {
        tag: "unrestricted".into(),
        grantor: claim_unrestricted_access_input.grantor,
        secret: claim_unrestricted_access_input.secret,
    })?;
    Ok(())
}
