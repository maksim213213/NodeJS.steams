export function fetchPost(postId, callback) {
  return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(
      (result) => callback(null, result),
      (error) => callback(error),
    );
}
