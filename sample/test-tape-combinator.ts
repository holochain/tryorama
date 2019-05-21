

module.exports = (scenario) => {

scenario('delete_post', async (s, t, insts) => {
  const { alice, bob } = insts
  //create post
  const alice_create_post_result = await alice.call("blog", "create_post",
    { "content": "Posty", "in_reply_to": "" }
  )

  await s.consistent()

  const bob_create_post_result = await bob.call("blog", "posts_by_agent",
    { "agent": alice.agentAddress }
  )

  t.ok(bob_create_post_result.Ok)
  t.equal(bob_create_post_result.Ok.links.length, 1);

  //remove link by alicce
  await alice.call("blog", "delete_post", { "content": "Posty", "in_reply_to": "" })

  await s.consistent()

  // get posts by bob
  const bob_agent_posts_expect_empty = await bob.call("blog", "posts_by_agent", { "agent": alice.agentAddress })

  t.ok(bob_agent_posts_expect_empty.Ok)
  t.equal(bob_agent_posts_expect_empty.Ok.links.length, 0);
})

scenario('post max content size 280 characters', async (s, t, insts) => {
  const { alice } = insts
  const content = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum."
  const in_reply_to = null
  const params = { content, in_reply_to }
  const result = await alice.call("blog", "create_post", params)

  // result should be an error
  t.ok(result.Err);
  t.notOk(result.Ok)

  const inner = JSON.parse(result.Err.Internal)

  t.ok(inner.file)
  t.deepEqual(inner.kind, { "ValidationFailed": "Content too long" })
  t.ok(inner.line)
})

}