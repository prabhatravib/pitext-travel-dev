import concurrent.futures
from flask import current_app
import googlemaps
# Corrected import path
from pitext_travel.api.llm import Itinerary, Stop

def enhance_itinerary_with_geocoding(itinerary: Itinerary, gmaps: googlemaps.Client) -> Itinerary:
    """
    Enhances the itinerary by geocoding each stop to get coordinates and other details in parallel.
    """
    
    def geocode_stop(stop):
        try:
            geocode_result = gmaps.geocode(stop.name)
            if geocode_result:
                location = geocode_result[0]['geometry']['location']
                stop.lat = location['lat']
                stop.lng = location['lng']
                stop.place_id = geocode_result[0]['place_id']
                stop.types = geocode_result[0]['types']
                current_app.logger.info(f"Found details for {stop.name}: {stop.lat}, {stop.lng}, Types: {stop.types}")
                return stop
        except Exception as e:
            current_app.logger.error(f"Error geocoding {stop.name}: {e}")
        return None

    # Use a ThreadPoolExecutor to perform geocoding requests concurrently
    with concurrent.futures.ThreadPoolExecutor() as executor:
        all_stops = [stop for day in itinerary.days for stop in day.stops]
        
        # This will submit all geocoding tasks at once and they will run in parallel
        future_to_stop = {executor.submit(geocode_stop, stop): stop for stop in all_stops}
        
        for future in concurrent.futures.as_completed(future_to_stop):
            # As each future completes, the result is processed
            # The original stop object in the itinerary is updated
            future.result()

    current_app.logger.info("Finished enhancing itinerary with geocoding.")
    return itinerary