// Description: Fetches the top 1000 starred repositories matching a given query
// Example usage: 
// const query = "stars:>0 license:gpl-2.0-or-later OR license:agpl-3.0 OR gpl-3.0 OR gpl-2.0 OR MPL-2.0";
// getTopStarredRepos(query).then((links) => {
//   console.log(links);
// });

import { Octokit, App } from "octokit";
import { config } from "dotenv";
import { MongoClient, ServerApiVersion } from 'mongodb';

config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const octokit = new Octokit({ auth: GITHUB_TOKEN });
const uri = process.env.MONGODB_URI;

async function getCurrentPage() 
{
	const client = await MongoClient.connect(uri);
	const db = client.db('jobs');
	const settingsCollection = db.collection('settings');
	const settings = await settingsCollection.findOne({ key: 'currentPage' });
	const currentPage = settings.value;
	client.close();
	return currentPage;
}

async function updateCurrentPage(newPage) 
{
	const client = await MongoClient.connect(uri);
	const db = client.db('jobs');
	const settingsCollection = db.collection('settings');
	await settingsCollection.updateOne({ key: 'currentPage' }, { $set: { value: newPage } }, { upsert: true });
	console.log("Updated current page to " + newPage + "\n")
	client.close();
}

async function getTopStarredRepos() 
{
	const query = "stars:>100 license:agpl-3.0 license:gpl-3.0 license:gpl-2. license:mpl-2.0 license:lgpl-3.0 license:lgpl-2.1";
	const sort = "stars";
	const order = "desc";
	const perPage = 100;
	let page = await getCurrentPage();

	let resultCount = 0;
	let repos = [];

	// Fetch up to maxPages pages of results
	const response = await octokit.rest.search.repos({
	q: query,
	sort: sort,
	order: order,
	per_page: perPage,
	page: page,
	});

	// Append the new repos to the existing list
	repos = repos.concat(response.data.items);

	// Update the result count and page counter
	resultCount += response.data.items.length;
	page += 1;
	await updateCurrentPage(page);

	// Return the links of the top 100 starred repositories
	return repos.slice(0, 100).map((repo) => repo.html_url);
}
// For cleanup and testing
// await updateCurrentPage(1);

export default getTopStarredRepos;
