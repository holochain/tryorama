# diorama

The first Holochain *test orchestrator*. 

## Basic usage

```js
const {Diorama} = require('@holochain/diorama')
const dnaBlog = Diorama.dna('path/to/blog.dna.json', 'blog')
const dnaComments = Diorama.dna('path/to/comments.dna.json', 'comments')

const diorama = new Diorama({
  instances: {
    aliceBlog: dnaBlog,
    aliceComments: dnaComments,
    bobBlog: dnaBlog,
    bobComments: dnaComments
  },
  bridges: [
    Diorama.bridge('handle', aliceBlog, aliceComments),
    Diorama.bridge('handle', bobBlog, bobComments),
  ]
})

diorama.registerScenario('a test', async (s, {aliceBlog, bobBlog}) => {
    await aliceBlog.call('blog', 'create_post', {
        content: 'holo wurld'
    })
    await s.consistent()
    const posts = await bobBlog.call('blog', 'list_posts')
    // write some assertions
})

diorama.run()

```

## Stay tuned

Much more documention to come!