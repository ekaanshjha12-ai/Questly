import { domMax } from 'framer-motion'

/**
 * Animation features for every motion component, loaded just after the first
 * paint rather than shipped in the main bundle. domMax because the app uses
 * layout animations — the navigation's sliding marker, tabs, the feed.
 */
export default domMax
